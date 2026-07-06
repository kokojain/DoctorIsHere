-- Puck replacement: the doctor scans a new puck's QR code and attaches it to
-- an existing place. The old puck's identity is RETIRED (spec: expired or
-- replaced identities stay burned in the catalog and can never be re-registered
-- — a lost/stolen puck must not keep working).

create or replace function public.replace_place_beacon(
  p_location_id uuid,
  p_uuid uuid,
  p_major integer,
  p_minor integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_catalog record;
  v_existing_reg record;
  v_old record;
  v_place_name text;
begin
  -- Caller must be the doctor who owns this place.
  select d.id into v_doc
  from doctors d
  join locations l on l.doctor_id = d.id
  where l.id = p_location_id and d.profile_id = auth.uid();
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- The scanned identity must be a valid, unexpired catalog puck.
  select * into v_catalog
  from beacon_catalog
  where uuid = p_uuid and major = p_major and minor = p_minor;
  if not found then
    return jsonb_build_object('error', 'unknown_beacon');
  end if;
  if v_catalog.retired or v_catalog.expires_at < now() then
    return jsonb_build_object('error', 'expired_beacon');
  end if;

  -- Already attached somewhere?
  select * into v_existing_reg from beacons where catalog_id = v_catalog.id;
  if found then
    if v_existing_reg.location_id = p_location_id then
      return jsonb_build_object('ok', true, 'unchanged', true);
    end if;
    return jsonb_build_object('error', 'already_registered');
  end if;

  -- Retire the puck currently on this place (if any) — permanently.
  select * into v_old from beacons where location_id = p_location_id;
  if found then
    delete from beacons where id = v_old.id;
    update beacon_catalog set retired = true where id = v_old.catalog_id;
  end if;

  select name into v_place_name from locations where id = p_location_id;
  insert into beacons (catalog_id, location_id, label)
  values (v_catalog.id, p_location_id, v_place_name);

  return jsonb_build_object('ok', true, 'retired_old', v_old.id is not null);
end;
$$;
