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

/** Reports a beacon arrival or heartbeat sighting to the backend. */
export async function reportBeacon(kind: 'arrival' | 'sighting', beacon: BeaconSighting) {
  const { data, error } = await supabase.functions.invoke('report-arrival', {
    body: { kind, uuid: beacon.uuid, major: beacon.major, minor: beacon.minor },
  });
  if (error) throw error;
  return data as { presence?: Presence; ignored?: string };
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
