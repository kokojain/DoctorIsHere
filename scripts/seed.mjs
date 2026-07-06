// Seeds the demo data: one doctor, one patient, one clinic, one beacon.
// Usage:  node scripts/seed.mjs   (reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// Minimal .env loader — avoids a dotenv dependency.
try {
  for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // no .env — rely on the environment
}

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.');
  process.exit(1);
}

const BEACON_UUID = (
  process.env.EXPO_PUBLIC_BEACON_UUID ?? '2F234454-CF6D-4A0F-ADF2-F4911BA9FFA6'
).toLowerCase();

const DOCTOR = {
  email: 'doctor@demo.doctorishere.app',
  password: 'DoctorDemo!234',
  full_name: 'Dr. Asha Mehta',
  role: 'doctor',
};
const PATIENT = {
  email: 'patient@demo.doctorishere.app',
  password: 'PatientDemo!234',
  full_name: 'Pat Patel',
  role: 'patient',
};

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

async function ensureUser({ email, password, full_name, role }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role },
  });
  if (!error) return data.user;
  // Already exists → find it.
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email === email);
  if (!existing) throw error;
  return existing;
}

async function main() {
  const doctorUser = await ensureUser(DOCTOR);
  const patientUser = await ensureUser(PATIENT);
  console.log(`✓ users: ${DOCTOR.email}, ${PATIENT.email}`);

  // The signup trigger created profiles; make sure roles/names are right
  // even if the users pre-existed with different metadata.
  await admin.from('profiles').upsert([
    { id: doctorUser.id, role: 'doctor', full_name: DOCTOR.full_name },
    { id: patientUser.id, role: 'patient', full_name: PATIENT.full_name },
  ]);

  const { data: doctor, error: doctorError } = await admin
    .from('doctors')
    .upsert(
      { profile_id: doctorUser.id, specialty: 'Family Medicine', verified: true },
      { onConflict: 'profile_id' }
    )
    .select()
    .single();
  if (doctorError) throw doctorError;
  console.log('✓ doctor row (verified)');

  let { data: location } = await admin
    .from('locations')
    .select()
    .eq('doctor_id', doctor.id)
    .eq('name', 'Sunrise Clinic')
    .maybeSingle();
  if (!location) {
    ({ data: location } = await admin
      .from('locations')
      .insert({ doctor_id: doctor.id, name: 'Sunrise Clinic', address: '1 Demo Way' })
      .select()
      .single());
  }
  console.log('✓ location: Sunrise Clinic');

  const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const { data: catalog, error: catalogError } = await admin
    .from('beacon_catalog')
    .upsert(
      {
        uuid: BEACON_UUID,
        major: 1,
        minor: 1,
        sku: 'DEMO-PUCK',
        sold_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'uuid,major,minor' }
    )
    .select()
    .single();
  if (catalogError) throw catalogError;

  await admin
    .from('beacons')
    .upsert(
      { catalog_id: catalog.id, location_id: location.id, label: 'Front desk' },
      { onConflict: 'catalog_id' }
    );
  console.log(`✓ beacon: uuid=${BEACON_UUID} major=1 minor=1 (expires ${expiresAt.slice(0, 10)})`);

  await admin
    .from('follows')
    .upsert(
      { patient_profile_id: patientUser.id, doctor_id: doctor.id, notify: true },
      { onConflict: 'patient_profile_id,doctor_id' }
    );
  console.log('✓ patient follows doctor (notifications on)');

  console.log('\nDemo credentials:');
  console.log(`  Doctor:  ${DOCTOR.email} / ${DOCTOR.password}`);
  console.log(`  Patient: ${PATIENT.email} / ${PATIENT.password}`);
  console.log('\nBeacon transmitter settings (Locate Beacon app):');
  console.log(`  UUID:  ${BEACON_UUID.toUpperCase()}`);
  console.log('  Major: 1   Minor: 1');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
