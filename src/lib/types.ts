export type Role = 'doctor' | 'patient' | 'admin';

export type PresenceStatus = 'present' | 'on_call' | 'away' | 'off_duty';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
}

export interface Doctor {
  id: string;
  profile_id: string;
  specialty: string | null;
  verified: boolean;
}

export interface ClinicLocation {
  id: string;
  doctor_id: string;
  name: string;
  address: string | null;
}

export interface Presence {
  id: string;
  doctor_id: string;
  location_id: string | null;
  status: PresenceStatus;
  source: 'beacon' | 'manual';
  started_at: string;
  expected_until: string | null;
  last_beacon_seen_at: string | null;
  unconfirmed: boolean;
  ended_at: string | null;
}

/** One row on the patient live board. */
export interface BoardDoctor {
  doctor_id: string;
  full_name: string;
  specialty: string | null;
  presence: Presence | null;
  location_name: string | null;
  followed: boolean;
}
