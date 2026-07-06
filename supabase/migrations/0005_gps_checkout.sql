-- GPS auto-checkout for manual check-ins.
-- On manual check-in the phone submits its GPS fix; the presence stores it as
-- an anchor and the place learns its coordinates (first fix wins). The phone
-- arms a geofence around the anchor; leaving it (default 500 m, configurable
-- via app_config.checkout_radius_meters) checks the doctor out.

alter table public.presence
  add column if not exists anchor_lat double precision,
  add column if not exists anchor_lng double precision;

alter table public.locations
  add column if not exists lat double precision,
  add column if not exists lng double precision;

insert into public.app_config (key, value)
values ('checkout_radius_meters', '500')
on conflict (key) do nothing;

-- ── manual_check_in ─────────────────────────────────────────────────────────
create or replace function public.manual_check_in(
  p_location_id uuid,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_presence_id uuid;
  v_radius integer;
begin
  select d.id into v_doc
  from doctors d
  join locations l on l.doctor_id = d.id
  where l.id = p_location_id and d.profile_id = auth.uid();
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  update presence set ended_at = now()
  where doctor_id = v_doc.id and ended_at is null;

  insert into presence (doctor_id, location_id, status, source, anchor_lat, anchor_lng)
  values (v_doc.id, p_location_id, 'present', 'manual', p_lat, p_lng)
  returning id into v_presence_id;

  -- Teach the place its coordinates from the first manual check-in there.
  if p_lat is not null and p_lng is not null then
    update locations set lat = coalesce(lat, p_lat), lng = coalesce(lng, p_lng)
    where id = p_location_id;
  end if;

  select coalesce((value #>> '{}')::integer, 500) into v_radius
  from app_config where key = 'checkout_radius_meters';

  return jsonb_build_object('ok', true, 'presence_id', v_presence_id, 'radius_meters', v_radius);
end;
$$;

-- ── gps_check_out: called by the phone when the geofence exit fires ─────────
create or replace function public.gps_check_out()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_open record;
  v_name text;
begin
  select id into v_doc from doctors where profile_id = auth.uid();
  if not found then
    return jsonb_build_object('error', 'not_a_doctor');
  end if;

  -- Only manual presences are governed by the geofence; beacon presences
  -- are closed by beacon-loss/duration rules instead.
  select * into v_open
  from presence
  where doctor_id = v_doc.id and ended_at is null and source = 'manual';
  if not found then
    return jsonb_build_object('ignored', 'no_manual_presence');
  end if;

  update presence set ended_at = now() where id = v_open.id;
  select name into v_name from locations where id = v_open.location_id;

  return jsonb_build_object('ok', true, 'location_name', v_name);
end;
$$;
