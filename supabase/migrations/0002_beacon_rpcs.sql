-- Beacon arrival + place provisioning as Postgres RPCs.
-- These carry the same validation as the report-arrival edge function
-- (catalog check, expiry, anti-spoof via auth.uid(), duration cool-off) but
-- deploy with `psql -f` — no Supabase CLI token required. The edge functions
-- in supabase/functions/ remain as an alternative deployment path.

create extension if not exists pg_net;

-- Additional demo puck inventory (major 1, minors 2–5) so "Add a place" has
-- identities to register beyond the seeded minor 1.
insert into public.beacon_catalog (uuid, major, minor, sku, sold_at, expires_at)
select '2f234454-cf6d-4a0f-adf2-f4911ba9ffa6'::uuid, 1, m, 'DEMO-PUCK', now(), now() + interval '1 year'
from generate_series(2, 5) as m
on conflict (uuid, major, minor) do nothing;

-- ── report_beacon: arrival + heartbeat, called by the doctor's phone ────────
create or replace function public.report_beacon(
  p_uuid uuid,
  p_major integer,
  p_minor integer,
  p_kind text default 'arrival'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_catalog record;
  v_reg record;
  v_loc record;
  v_doc record;
  v_open record;
  v_last record;
  v_cooloff integer;
  v_now timestamptz := now();
  v_presence_id uuid;
  v_push_body jsonb;
begin
  if v_caller is null then
    return jsonb_build_object('error', 'unauthorized');
  end if;

  select * into v_catalog
  from beacon_catalog
  where uuid = p_uuid and major = p_major and minor = p_minor;
  if not found then
    return jsonb_build_object('ignored', 'unknown_beacon');
  end if;
  if v_catalog.retired or v_catalog.expires_at < v_now then
    return jsonb_build_object('ignored', 'expired_beacon');
  end if;

  select * into v_reg from beacons where catalog_id = v_catalog.id and active;
  if not found then
    return jsonb_build_object('ignored', 'unregistered_beacon');
  end if;

  select * into v_loc from locations where id = v_reg.location_id;
  select d.id, d.profile_id, p.full_name into v_doc
  from doctors d join profiles p on p.id = d.profile_id
  where d.id = v_loc.doctor_id;

  -- Anti-spoof: only the owning doctor's session may report this beacon.
  if v_doc.profile_id <> v_caller then
    return jsonb_build_object('ignored', 'not_your_beacon');
  end if;

  update beacons set last_seen_at = v_now where id = v_reg.id;

  select * into v_open from presence where doctor_id = v_doc.id and ended_at is null;

  -- Heartbeat at the current location: refresh last_beacon_seen_at only.
  if found and v_open.location_id = v_loc.id then
    update presence
    set last_beacon_seen_at = v_now, unconfirmed = false
    where id = v_open.id;
    return jsonb_build_object('ok', true, 'heartbeat', true);
  end if;

  -- Duration cool-off: an expired timer means "gone" even if the beacon still
  -- hears the doctor — don't silently re-open (duration is authoritative).
  select coalesce((value #>> '{}')::integer, 600) into v_cooloff
  from app_config where key = 'duration_cooloff_seconds';
  select ended_at, expected_until into v_last
  from presence
  where doctor_id = v_doc.id and location_id = v_loc.id
    and ended_at is not null and expected_until is not null
  order by ended_at desc
  limit 1;
  if found
     and v_last.ended_at >= v_last.expected_until
     and v_now - v_last.ended_at < make_interval(secs => v_cooloff) then
    return jsonb_build_object('ignored', 'duration_cooloff');
  end if;

  -- Close whatever was open (possibly another location), open here.
  if v_open.id is not null then
    update presence set ended_at = v_now where id = v_open.id;
  end if;

  insert into presence (doctor_id, location_id, status, source, last_beacon_seen_at)
  values (v_doc.id, v_loc.id, 'present', 'beacon', v_now)
  returning id into v_presence_id;

  -- Push fan-out to followers (best effort; failures never block the arrival).
  begin
    select jsonb_agg(jsonb_build_object(
      'to', dv.expo_push_token,
      'title', 'DoctorIsHere',
      'body', v_doc.full_name || ' just arrived at ' || v_loc.name,
      'sound', 'default'
    )) into v_push_body
    from follows f
    join devices dv on dv.profile_id = f.patient_profile_id
    where f.doctor_id = v_doc.id and f.notify;

    if v_push_body is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_push_body
      );
    end if;
  exception when others then
    null;
  end;

  return jsonb_build_object('ok', true, 'presence_id', v_presence_id);
end;
$$;

-- ── register_place: "Add a place" provisioning flow ─────────────────────────
create or replace function public.register_place(
  p_uuid uuid,
  p_major integer,
  p_minor integer,
  p_name text,
  p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_catalog record;
  v_loc_id uuid;
begin
  select * into v_doc from doctors where profile_id = auth.uid();
  if not found then
    return jsonb_build_object('error', 'not_a_doctor');
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    return jsonb_build_object('error', 'name_required');
  end if;

  select * into v_catalog
  from beacon_catalog
  where uuid = p_uuid and major = p_major and minor = p_minor;
  if not found then
    return jsonb_build_object('error', 'unknown_beacon');
  end if;
  if v_catalog.retired or v_catalog.expires_at < now() then
    return jsonb_build_object('error', 'expired_beacon');
  end if;
  if exists (select 1 from beacons where catalog_id = v_catalog.id) then
    return jsonb_build_object('error', 'already_registered');
  end if;

  insert into locations (doctor_id, name, address)
  values (v_doc.id, trim(p_name), p_address)
  returning id into v_loc_id;

  insert into beacons (catalog_id, location_id, label)
  values (v_catalog.id, v_loc_id, trim(p_name));

  return jsonb_build_object('ok', true, 'location_id', v_loc_id);
end;
$$;

-- ── remove_place ────────────────────────────────────────────────────────────
create or replace function public.remove_place(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
begin
  select d.id into v_doc
  from doctors d
  join locations l on l.doctor_id = d.id
  where l.id = p_location_id and d.profile_id = auth.uid();
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  update presence set ended_at = now()
  where location_id = p_location_id and ended_at is null;

  -- Cascade removes the beacon registration, freeing the puck for re-registration.
  delete from locations where id = p_location_id;

  return jsonb_build_object('ok', true);
end;
$$;
