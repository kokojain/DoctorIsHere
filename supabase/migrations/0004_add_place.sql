-- A place can be created without a puck; the puck is scanned and attached
-- later (replace_place_beacon doubles as "attach" when no beacon exists yet).

create or replace function public.add_place(
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
  v_loc_id uuid;
begin
  select * into v_doc from doctors where profile_id = auth.uid();
  if not found then
    return jsonb_build_object('error', 'not_a_doctor');
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    return jsonb_build_object('error', 'name_required');
  end if;

  insert into locations (doctor_id, name, address)
  values (v_doc.id, trim(p_name), p_address)
  returning id into v_loc_id;

  return jsonb_build_object('ok', true, 'location_id', v_loc_id);
end;
$$;
