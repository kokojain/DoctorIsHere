-- DoctorIsHere demo schema (PLAN.md §4, demo subset)

-- ── Profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'patient' check (role in ('doctor', 'patient', 'admin')),
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile on signup; role/full_name come from user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'patient'),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Doctors & locations ─────────────────────────────────────────────────────
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  specialty text,
  bio text,
  verified boolean not null default false
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

-- ── Beacons ─────────────────────────────────────────────────────────────────
-- Every puck we ever programmed/sold; the source of truth for valid identities.
create table public.beacon_catalog (
  id uuid primary key default gen_random_uuid(),
  uuid uuid not null,
  major integer not null,
  minor integer not null,
  sku text,
  provisioned_at timestamptz not null default now(),
  sold_at timestamptz,
  expires_at timestamptz not null,
  retired boolean not null default false,
  unique (uuid, major, minor)
);

-- A doctor's registration of a purchased puck to one of their places.
create table public.beacons (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null unique references public.beacon_catalog (id),
  location_id uuid not null references public.locations (id) on delete cascade,
  label text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  battery_pct integer,
  active boolean not null default true
);

-- ── Presence ────────────────────────────────────────────────────────────────
create table public.presence (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  status text not null default 'present' check (status in ('present', 'on_call', 'away', 'off_duty')),
  source text not null default 'beacon' check (source in ('beacon', 'manual')),
  started_at timestamptz not null default now(),
  expected_until timestamptz,
  last_beacon_seen_at timestamptz,
  unconfirmed boolean not null default false,
  ended_at timestamptz
);

-- One open presence per doctor.
create unique index presence_one_open_per_doctor
  on public.presence (doctor_id)
  where ended_at is null;

-- ── Follows & devices ───────────────────────────────────────────────────────
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.profiles (id) on delete cascade,
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  unique (patient_profile_id, doctor_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'ios',
  last_keepalive_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (profile_id, expo_push_token)
);

-- ── Config (demo uses short windows; production values in comments) ─────────
create table public.app_config (
  key text primary key,
  value jsonb not null
);

insert into public.app_config (key, value) values
  ('loss_window_seconds', '60'),        -- production: 300
  ('duration_cooloff_seconds', '600');  -- ignore re-arrivals this long after a duration-expiry close

-- ── Server-side departure timers (PLAN.md: the backend decides "gone") ──────
create or replace function public.sweep_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  loss_window integer := coalesce(
    (select (value #>> '{}')::integer from public.app_config where key = 'loss_window_seconds'),
    300
  );
begin
  -- Rule 1: an entered duration is authoritative.
  update public.presence
  set ended_at = now()
  where ended_at is null
    and expected_until is not null
    and expected_until < now();

  -- Rule 2: no duration → gone when beacons fall silent past the loss window.
  update public.presence
  set ended_at = now()
  where ended_at is null
    and expected_until is null
    and source = 'beacon'
    and last_beacon_seen_at is not null
    and last_beacon_seen_at < now() - make_interval(secs => loss_window);
end;
$$;

-- Run the sweeper every minute. pg_cron ships with hosted Supabase; the DO
-- block keeps this migration usable on local stacks without it.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('presence-sweeper', '* * * * *', 'select public.sweep_presence()');
exception when others then
  raise notice 'pg_cron unavailable — schedule sweep_presence() another way (%).', sqlerrm;
end;
$$;

-- ── Realtime ────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.presence;

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.doctors enable row level security;
alter table public.locations enable row level security;
alter table public.beacon_catalog enable row level security; -- no policies: service-role only
alter table public.beacons enable row level security;
alter table public.presence enable row level security;
alter table public.follows enable row level security;
alter table public.devices enable row level security;
alter table public.app_config enable row level security;

-- Board data is readable by any signed-in user.
create policy "profiles are readable" on public.profiles
  for select to authenticated using (true);
create policy "own profile is updatable" on public.profiles
  for update to authenticated using (id = auth.uid());
create policy "doctors are readable" on public.doctors
  for select to authenticated using (true);
create policy "locations are readable" on public.locations
  for select to authenticated using (true);
create policy "presence is readable" on public.presence
  for select to authenticated using (true);
create policy "config is readable" on public.app_config
  for select to authenticated using (true);

-- Doctors manage their own presence (manual check-in/clear, duration).
create policy "doctor writes own presence" on public.presence
  for insert to authenticated
  with check (doctor_id in (select id from public.doctors where profile_id = auth.uid()));
create policy "doctor updates own presence" on public.presence
  for update to authenticated
  using (doctor_id in (select id from public.doctors where profile_id = auth.uid()));

-- Beacon registrations visible only to the owning doctor (anti-tracking).
create policy "doctor reads own beacons" on public.beacons
  for select to authenticated
  using (location_id in (
    select l.id from public.locations l
    join public.doctors d on d.id = l.doctor_id
    where d.profile_id = auth.uid()
  ));

-- Follows and devices are owner-only.
create policy "own follows" on public.follows
  for all to authenticated
  using (patient_profile_id = auth.uid())
  with check (patient_profile_id = auth.uid());
create policy "own devices" on public.devices
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
