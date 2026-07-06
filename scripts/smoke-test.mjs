// Backend smoke test: exercises the demo pipeline with real API calls.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const ENV_PATH = new URL('../.env', import.meta.url);
for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const url = process.env.SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function client() {
  return createClient(url, anon, { auth: { persistSession: false } });
}

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

// 1. Doctor signs in
const doctorClient = client();
const { data: docAuth, error: docAuthErr } = await doctorClient.auth.signInWithPassword({
  email: 'doctor@demo.doctorishere.app',
  password: 'DoctorDemo!234',
});
check('doctor sign-in', !docAuthErr, docAuthErr?.message);

// 2. Doctor profile + doctor row + location resolve
const { data: doctorRow } = await doctorClient
  .from('doctors').select('id, verified, profiles(full_name)').eq('profile_id', docAuth.user.id).single();
check('doctor row (verified)', !!doctorRow?.verified, doctorRow?.profiles?.full_name);
const { data: loc } = await doctorClient
  .from('locations').select('id, name').eq('doctor_id', doctorRow.id).single();
check('location visible', loc?.name === 'Sunrise Clinic');

// 3. Manual check-in (RLS: doctor writes own presence)
await doctorClient.from('presence').update({ ended_at: new Date().toISOString() })
  .eq('doctor_id', doctorRow.id).is('ended_at', null);
const { data: presence, error: insErr } = await doctorClient
  .from('presence')
  .insert({ doctor_id: doctorRow.id, location_id: loc.id, status: 'present', source: 'manual' })
  .select().single();
check('manual check-in insert', !insErr, insErr?.message);

// 4. Patient signs in and sees the board
const patientClient = client();
const { data: patAuth, error: patAuthErr } = await patientClient.auth.signInWithPassword({
  email: 'patient@demo.doctorishere.app',
  password: 'PatientDemo!234',
});
check('patient sign-in', !patAuthErr, patAuthErr?.message);
const { data: boardPresence } = await patientClient
  .from('presence').select('id, location_id, locations(name)').is('ended_at', null)
  .eq('doctor_id', doctorRow.id).maybeSingle();
check('patient sees doctor present', boardPresence?.locations?.name === 'Sunrise Clinic');

// 5. Patient cannot write presence (RLS negative)
const { error: rlsErr } = await patientClient
  .from('presence').insert({ doctor_id: doctorRow.id, location_id: loc.id, source: 'manual' });
check('patient blocked from writing presence (RLS)', !!rlsErr);

// 6. Patient's follow row is visible to them
const { data: follows } = await patientClient
  .from('follows').select('doctor_id, notify').eq('patient_profile_id', patAuth.user.id);
check('patient follows doctor', follows?.length === 1 && follows[0].notify === true);

// 7. Duration rule: set expected_until in the past, run sweeper, presence closes
await doctorClient.from('presence')
  .update({ expected_until: new Date(Date.now() - 5000).toISOString() })
  .eq('id', presence.id);
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error: sweepErr } = await admin.rpc('sweep_presence');
check('sweep_presence() runs', !sweepErr, sweepErr?.message);
const { data: after } = await patientClient
  .from('presence').select('id').is('ended_at', null).eq('doctor_id', doctorRow.id).maybeSingle();
check('board flips to Away after duration expiry', after == null);

// 8. Realtime: subscribe, make a change, expect an event
const rtClient = client();
await rtClient.auth.signInWithPassword({
  email: 'patient@demo.doctorishere.app',
  password: 'PatientDemo!234',
});
const { data: rtSession } = await rtClient.auth.getSession();
await rtClient.realtime.setAuth(rtSession.session.access_token);
const gotEvent = await new Promise((resolve) => {
  const timer = setTimeout(() => resolve(false), 15000);
  rtClient
    .channel('smoke-presence')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'presence' }, () => {
      clearTimeout(timer);
      resolve(true);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Binding confirmation lags SUBSCRIBED; give it a beat before writing.
        await new Promise((r) => setTimeout(r, 2500));
        await doctorClient.from('presence').insert({
          doctor_id: doctorRow.id, location_id: loc.id, status: 'present', source: 'manual',
        });
      }
    });
});
check('realtime presence event received', gotEvent);

// Cleanup: close any open presence so the demo starts from Away.
await doctorClient.from('presence').update({ ended_at: new Date().toISOString() })
  .eq('doctor_id', doctorRow.id).is('ended_at', null);
console.log(failures === 0 ? '\nAll smoke tests passed.' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
