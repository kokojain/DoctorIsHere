import { supabase } from './supabase';
import type { BoardDoctor, ClinicLocation, Presence } from './types';

export type OpenPresence = Presence & { location_name: string | null };

export async function fetchMyOpenPresence(doctorId: string): Promise<OpenPresence | null> {
  const { data, error } = await supabase
    .from('presence')
    .select('*, locations(name)')
    .eq('doctor_id', doctorId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { locations, ...presence } = data as Presence & {
    locations: { name: string } | null;
  };
  return { ...presence, location_name: locations?.name ?? null };
}

export async function fetchMyLocations(doctorId: string): Promise<ClinicLocation[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, doctor_id, name, address')
    .eq('doctor_id', doctorId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export interface BeaconSighting {
  uuid: string;
  major: number;
  minor: number;
}

/**
 * Reports a beacon arrival or heartbeat sighting. Server-side validation
 * (catalog, expiry, anti-spoof, duration cool-off) lives in the
 * report_beacon Postgres function — see supabase/migrations/0002.
 */
export async function reportBeacon(kind: 'arrival' | 'sighting', beacon: BeaconSighting) {
  const { data, error } = await supabase.rpc('report_beacon', {
    p_uuid: beacon.uuid,
    p_major: beacon.major,
    p_minor: beacon.minor,
    p_kind: kind,
  });
  if (error) throw error;
  return data as { ok?: boolean; heartbeat?: boolean; ignored?: string; error?: string };
}

export interface MyPlace extends ClinicLocation {
  beacon: { label: string | null; last_seen_at: string | null; active: boolean } | null;
}

export async function fetchMyPlaces(doctorId: string): Promise<MyPlace[]> {
  const { data, error } = await supabase
    .from('locations')
    .select('id, doctor_id, name, address, beacons(label, last_seen_at, active)')
    .eq('doctor_id', doctorId)
    .order('name');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { beacons, ...location } = row as ClinicLocation & {
      beacons: { label: string | null; last_seen_at: string | null; active: boolean }[] | null;
    };
    return { ...location, beacon: beacons?.[0] ?? null };
  });
}

const RPC_ERRORS: Record<string, string> = {
  not_a_doctor: 'Only doctor accounts can register beacons.',
  name_required: 'Give this place a name first.',
  unknown_beacon: 'This is not a DoctorIsHere beacon (not in the catalog).',
  expired_beacon: 'This beacon has expired — order a replacement puck.',
  already_registered: 'This beacon is already registered to a place.',
  not_found: 'Place not found.',
};

export async function registerPlace(beacon: BeaconSighting, name: string, address?: string) {
  const { data, error } = await supabase.rpc('register_place', {
    p_uuid: beacon.uuid,
    p_major: beacon.major,
    p_minor: beacon.minor,
    p_name: name,
    p_address: address ?? null,
  });
  if (error) throw error;
  if (data?.error) throw new Error(RPC_ERRORS[data.error] ?? data.error);
  return data as { ok: true; location_id: string };
}

export async function removePlace(locationId: string) {
  const { data, error } = await supabase.rpc('remove_place', { p_location_id: locationId });
  if (error) throw error;
  if (data?.error) throw new Error(RPC_ERRORS[data.error] ?? data.error);
}

/** Attach a freshly scanned puck to an existing place; the old puck is retired. */
export async function replacePlaceBeacon(locationId: string, beacon: BeaconSighting) {
  const { data, error } = await supabase.rpc('replace_place_beacon', {
    p_location_id: locationId,
    p_uuid: beacon.uuid,
    p_major: beacon.major,
    p_minor: beacon.minor,
  });
  if (error) throw error;
  if (data?.error) throw new Error(RPC_ERRORS[data.error] ?? data.error);
  return data as { ok: true; unchanged?: boolean; retired_old?: boolean };
}

export async function setExpectedUntil(presenceId: string, minutes: number | null) {
  const expected_until =
    minutes == null ? null : new Date(Date.now() + minutes * 60_000).toISOString();
  const { error } = await supabase
    .from('presence')
    .update({ expected_until })
    .eq('id', presenceId);
  if (error) throw error;
}

export async function clearMyPresence(doctorId: string) {
  const { error } = await supabase
    .from('presence')
    .update({ ended_at: new Date().toISOString() })
    .eq('doctor_id', doctorId)
    .is('ended_at', null);
  if (error) throw error;
}

export async function manualCheckIn(doctorId: string, locationId: string) {
  await clearMyPresence(doctorId);
  const { error } = await supabase.from('presence').insert({
    doctor_id: doctorId,
    location_id: locationId,
    status: 'present',
    source: 'manual',
  });
  if (error) throw error;
}

export async function fetchBoard(myProfileId: string): Promise<BoardDoctor[]> {
  const [doctorsRes, presenceRes, followsRes] = await Promise.all([
    supabase
      .from('doctors')
      .select('id, specialty, profiles(full_name)')
      .eq('verified', true),
    supabase.from('presence').select('*, locations(name)').is('ended_at', null),
    supabase.from('follows').select('doctor_id').eq('patient_profile_id', myProfileId),
  ]);
  if (doctorsRes.error) throw doctorsRes.error;
  if (presenceRes.error) throw presenceRes.error;
  if (followsRes.error) throw followsRes.error;

  const presenceByDoctor = new Map<string, Presence & { locations: { name: string } | null }>();
  for (const row of presenceRes.data ?? []) {
    presenceByDoctor.set(row.doctor_id, row);
  }
  const followed = new Set((followsRes.data ?? []).map((f) => f.doctor_id));

  return (doctorsRes.data ?? []).map((doctor) => {
    const row = presenceByDoctor.get(doctor.id) ?? null;
    const profileJoin = doctor.profiles as unknown as { full_name: string } | null;
    let presence: Presence | null = null;
    let locationName: string | null = null;
    if (row) {
      const { locations, ...rest } = row;
      presence = rest;
      locationName = locations?.name ?? null;
    }
    return {
      doctor_id: doctor.id,
      full_name: profileJoin?.full_name ?? 'Doctor',
      specialty: doctor.specialty,
      presence,
      location_name: locationName,
      followed: followed.has(doctor.id),
    };
  });
}

export async function setFollow(myProfileId: string, doctorId: string, follow: boolean) {
  if (follow) {
    const { error } = await supabase
      .from('follows')
      .upsert(
        { patient_profile_id: myProfileId, doctor_id: doctorId, notify: true },
        { onConflict: 'patient_profile_id,doctor_id' }
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('patient_profile_id', myProfileId)
      .eq('doctor_id', doctorId);
    if (error) throw error;
  }
}

export async function registerDevice(profileId: string, expoPushToken: string) {
  const { error } = await supabase.from('devices').upsert(
    {
      profile_id: profileId,
      expo_push_token: expoPushToken,
      platform: 'ios',
      last_keepalive_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,expo_push_token' }
  );
  if (error) throw error;
}

/** Realtime: invalidate on any presence change. Returns an unsubscribe fn. */
export function subscribeToPresence(onChange: () => void): () => void {
  const channel = supabase
    .channel('presence-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'presence' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
