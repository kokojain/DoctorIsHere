# DoctorIsHere — Demo Runbook

Goal: the doctor walks in → patient phone updates within seconds and gets a push.
Companion docs: [PLAN.md](PLAN.md) (spec) · [TEST-CASES.md](TEST-CASES.md) (test plan)

## What you need

| Item | Purpose |
|---|---|
| iPhone A (spare) | **The beacon.** Runs the free "Locate Beacon" app (Radius Networks), transmitting. Screen on, Auto-Lock → Never, plugged in. |
| iPhone B | **The doctor's phone.** Runs the DoctorIsHere dev build, signed in as the demo doctor. |
| iPhone/iPad C (or simulator) | **The patient's phone.** Signed in as the demo patient. Push needs a physical device. |
| Supabase project | Free tier is fine. |
| Apple Developer account | For the dev build on device + push. |
| 2–3 Blue Charm pucks (ordered) | Real-hardware validation + demo prop. Locate Beacon substitutes until they arrive. |

## One-time setup

1. **Supabase**: create a project at supabase.com, then from the repo root:
   ```sh
   npm install -g supabase eas-cli        # or: npx supabase / npx eas
   supabase link --project-ref <YOUR_PROJECT_REF>
   supabase db push                       # applies supabase/migrations
   supabase functions deploy report-arrival presence-sweeper
   ```
2. **Env**: `cp .env.example .env`, fill in the project URL, anon key, and service-role key (Supabase dashboard → Settings → API).
3. **Seed demo data**: `node scripts/seed.mjs` — prints the demo credentials and the exact beacon settings.
4. **EAS + push**: `eas init` (links the project, adds `extra.eas.projectId` — required for push tokens), then build the dev client:
   ```sh
   eas build --profile development --platform ios
   ```
   Install the build on iPhones B and C, then `npx expo start` and open the app.
5. **Transmitter (iPhone A)**: install "Locate Beacon" → Transmit tab →
   UUID `2F234454-CF6D-4A0F-ADF2-F4911BA9FFA6`, Major `1`, Minor `1` → Start.
   (These match the seed; also the app default, so usually zero typing.)

## Demo script (rehearse twice — TEST-CASES DA-06, DA-09, DA-10, PA-01, PA-02, PA-07)

1. **Setup on the table**: patient phone showing the Live Board (doctor shows *Away*); doctor phone signed in, app open once so location permission ("Always") is granted, then backgrounded. Transmitter phone OFF for now.
2. **The moment**: turn the transmitter on (or walk the doctor phone toward it).
   → Doctor phone reports arrival. Patient board flips to **"At Sunrise Clinic"** within ~5 s and the patient phone gets the **"Dr. Asha Mehta just arrived"** push.
3. **Duration**: on the doctor phone, answer "How long will you be here?" → 1 hour.
   → Patient board now reads **"until ~HH:MM"**.
4. **Departure (pick one)**:
   - *Beacon loss*: turn the transmitter off (with no timer set) → board flips to Away within the demo loss window (60 s).
   - *Timer*: for a live-audience flip, temporarily set a 2-minute duration; the sweeper (runs every minute) closes it — or hit the `presence-sweeper` function to flip it instantly.
5. **The prop**: hand over a Blue Charm puck — "this is all the hardware your clinic needs; it runs four years on a coin cell."

## Demo-day safety valves

- **Manual override** on the doctor's My Presence screen drives the exact same pipeline — if venue Bluetooth misbehaves, the demo still works.
- The **"Beacon" diagnostics card** on the doctor screen shows permission status and the last-heard beacon — first place to look if nothing happens.
- Demo timer windows are set in the `app_config` table (`loss_window_seconds` = 60). Production values are noted in the migration.

## Known limits of this build (deliberate — see PLAN.md milestones)

Email login only (Apple/Google sign-in later) · no SMS keep-alive flow yet · no expiry/gifting yet · iOS only · killed-app wakeups untested (backgrounded app works).
