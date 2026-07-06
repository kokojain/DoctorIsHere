// Receives beacon arrivals and heartbeat sightings from the doctor's phone.
// Validates the beacon against the catalog (anti-spoof: the authenticated user
// must own it), maintains the single open presence row, and fans out Expo
// pushes to followers on arrival. Departure is handled by sweep_presence().
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ReportBody {
  kind: 'arrival' | 'sighting';
  uuid: string;
  major: number;
  minor: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  // Identify the caller from their JWT.
  const authedClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  );
  const { data: userData, error: userError } = await authedClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401);
  const callerId = userData.user.id;

  let body: ReportBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const { kind, uuid, major, minor } = body;
  if (!uuid || major == null || minor == null || !['arrival', 'sighting'].includes(kind)) {
    return json({ error: 'bad request' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const nowIso = new Date().toISOString();

  // Beacon identity must exist in the catalog, be unexpired, and be registered.
  const { data: catalog } = await admin
    .from('beacon_catalog')
    .select('id, expires_at, retired')
    .eq('uuid', uuid.toLowerCase())
    .eq('major', major)
    .eq('minor', minor)
    .maybeSingle();
  if (!catalog) return json({ ignored: 'unknown_beacon' });
  if (catalog.retired || new Date(catalog.expires_at) < new Date()) {
    return json({ ignored: 'expired_beacon' });
  }

  const { data: registration } = await admin
    .from('beacons')
    .select('id, location_id, active')
    .eq('catalog_id', catalog.id)
    .maybeSingle();
  if (!registration || !registration.active) return json({ ignored: 'unregistered_beacon' });

  const { data: location } = await admin
    .from('locations')
    .select('id, name, doctor_id')
    .eq('id', registration.location_id)
    .single();
  const { data: doctor } = await admin
    .from('doctors')
    .select('id, profile_id, profiles(full_name)')
    .eq('id', location!.doctor_id)
    .single();

  // Anti-spoof: only the owning doctor's own device may report this beacon.
  if (doctor!.profile_id !== callerId) return json({ ignored: 'not_your_beacon' });

  await admin.from('beacons').update({ last_seen_at: nowIso }).eq('id', registration.id);

  const { data: openPresence } = await admin
    .from('presence')
    .select('id, location_id, expected_until')
    .eq('doctor_id', doctor!.id)
    .is('ended_at', null)
    .maybeSingle();

  // Heartbeat at the current location: just refresh last_beacon_seen_at.
  if (openPresence && openPresence.location_id === location!.id) {
    await admin
      .from('presence')
      .update({ last_beacon_seen_at: nowIso, unconfirmed: false })
      .eq('id', openPresence.id);
    return json({ ok: true, heartbeat: true });
  }

  // Arrival (new presence or moved locations). Respect the duration cool-off:
  // if a timer just expired here, the doctor is "gone" even if the beacon
  // still hears them — do not silently re-open (spec: duration is authoritative).
  const { data: cooloffRow } = await admin
    .from('app_config')
    .select('value')
    .eq('key', 'duration_cooloff_seconds')
    .maybeSingle();
  const cooloffSeconds = Number(cooloffRow?.value ?? 600);
  const { data: lastClosed } = await admin
    .from('presence')
    .select('ended_at, expected_until')
    .eq('doctor_id', doctor!.id)
    .eq('location_id', location!.id)
    .not('ended_at', 'is', null)
    .not('expected_until', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastClosed) {
    const closedByTimer = new Date(lastClosed.ended_at) >= new Date(lastClosed.expected_until);
    const withinCooloff =
      Date.now() - new Date(lastClosed.ended_at).getTime() < cooloffSeconds * 1000;
    if (closedByTimer && withinCooloff) {
      return json({ ignored: 'duration_cooloff' });
    }
  }

  // Close whatever was open (e.g. presence at a different location) and open here.
  if (openPresence) {
    await admin.from('presence').update({ ended_at: nowIso }).eq('id', openPresence.id);
  }
  const { data: presence, error: insertError } = await admin
    .from('presence')
    .insert({
      doctor_id: doctor!.id,
      location_id: location!.id,
      status: 'present',
      source: 'beacon',
      last_beacon_seen_at: nowIso,
    })
    .select()
    .single();
  if (insertError) return json({ error: insertError.message }, 500);

  // Fan out "Dr. X just arrived" pushes to followers who opted in.
  const { data: followers } = await admin
    .from('follows')
    .select('patient_profile_id')
    .eq('doctor_id', doctor!.id)
    .eq('notify', true);
  const followerIds = (followers ?? []).map((f) => f.patient_profile_id);
  if (followerIds.length > 0) {
    const { data: devices } = await admin
      .from('devices')
      .select('expo_push_token')
      .in('profile_id', followerIds);
    const doctorName =
      (doctor!.profiles as unknown as { full_name: string } | null)?.full_name ?? 'Your doctor';
    const messages = (devices ?? []).map((d) => ({
      to: d.expo_push_token,
      title: 'DoctorIsHere',
      body: `${doctorName} just arrived at ${location!.name}`,
      sound: 'default',
    }));
    if (messages.length > 0) {
      // Fire-and-forget; push failure must not fail the arrival.
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      }).catch(() => {});
    }
  }

  return json({ ok: true, presence });
});
