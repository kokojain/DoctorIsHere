# DoctorIsHere — Beacon-Based Doctor Presence & On-Call Tracker

**Status:** Planning
**Last updated:** 2026-07-04
**Test plan:** [TEST-CASES.md](TEST-CASES.md)

A mobile app for iPhone and Android. Doctors carry their phone; **Bluetooth Low Energy (BTLE) beacons placed at each location a doctor works** let the system detect automatically where the doctor is. Patients see a live board of where each doctor is right now and get a push notification when their doctor arrives. One codebase, two user roles.

---

## 1. Core concept: beacon-driven presence

Presence is **automatic**, not manual. The doctor places one BTLE beacon at each place they regularly go (Clinic A front desk, Hospital B ward, private office…). The doctor's phone listens for these beacons in the background.

### The presence lifecycle

1. **Arrival (beacon heard).** The doctor's phone detects a registered beacon. The app immediately reports to the backend: *doctor X is now at location Y*. Patients' live boards update and followers are notified.
2. **Duration prompt.** On arrival the app prompts the doctor: *"You're at Sunrise Clinic — how long will you be here?"* The doctor can enter a duration (e.g., 30 min / 1 h / 2 h / custom) or dismiss the prompt.
3. **Departure — two rules:**
   - **Duration entered:** when the entered time expires, the system assumes the doctor has left and marks them gone from that location. (If the beacon is still heard at expiry, the app re-prompts to extend — see Open Questions.)
   - **No duration entered:** the system assumes the doctor is gone when the beacons are **no longer heard**. The phone reports beacon sightings as heartbeats; after a loss window with no sighting (default **5 minutes**, tunable), the backend marks the doctor gone. This rule applies only while the phone itself is still in contact — see *keep-alives* below.
4. **Moving between locations.** Hearing a beacon for a different registered location immediately closes the previous presence and opens a new one there — the newest beacon wins.
5. **Manual fallback.** The doctor can always set status by hand (check in/out, on call, "away until…") for places without a beacon, dead phone batteries, or corrections. Manual entries override beacon-derived state until the next beacon event.

### Two signals: beacon sightings and phone keep-alives

The phone may be killed, offline, or out of battery — it can't be trusted to send a "departed" message, so the backend runs all the timers. The phone reports two independent things:

- **Beacon sightings** — proof of *where* the doctor is.
- **Keep-alives** — periodic "the app is alive and reporting" pings, proving the reporting channel itself works. They are piggybacked on every beacon report and also sent on a background timer even when no beacon is in range.

Two very different kinds of silence, handled differently:

| Situation | Backend behavior |
|---|---|
| Keep-alives healthy, duration entered, duration expires | Mark **gone** (duration is authoritative). |
| Keep-alives healthy, no duration, beacons silent past the loss window | The phone is fine and genuinely hears no beacon → doctor has left → mark **gone**. |
| **Keep-alives stop** (phone dead, offline, or app killed by the OS) | **Do not mark gone.** The server **maintains the last known state**, flags it *unconfirmed*, and **sends the doctor an SMS**: "DoctorIsHere lost contact with your phone — patients still see you at Sunrise Clinic (since 2:10 pm). Reply KEEP to stay shown, GONE to clear, or open the app." |
| Keep-alives resume | Clear the *unconfirmed* flag and reconcile: a fresh beacon report wins; otherwise normal rules resume. |

The SMS (and its reply keywords, or an equivalent link) lets the doctor correct their status from any phone, even with the app dead. The keep-alive grace window defaults to **15 minutes** — iOS/Android background scheduling is jittery, so a shorter window would fire false alarms.

Patients are never shown a silent lie: while a presence is *unconfirmed*, the live board shows the last known location with an "as of &lt;time&gt;" qualifier.

### Beacon hardware & identity

- Standard **iBeacon-protocol** BTLE pucks (coin-cell powered, configurable UUID/major/minor). Candidate hardware, all buyable today:

| Puck | Price (ea.) | Battery | Notes |
|---|---|---|---|
| **Blue Charm BC011-MultiBeacon** | ~$19.45 | CR2477, years-class, battery level in broadcast | Simple puck; broadcasts battery % — feeds our beacon-health screen. |
| **Blue Charm BC05-MultiBeacon** | ~$20.95 | CR2477, ~4 yr, replaceable | IP67 water-resistant puck, 5 broadcast slots. |
| **Feasycom FSC-BP104D** | ~$15–25 | 2×AAA, up to 10 yr, replaceable | IP67, long range (400 m class), iBeacon+Eddystone. |
| **Feasycom FSC-BP106** | ~$10–15 | coin cell | Small asset-tag puck, 10 advertising slots; cheapest bulk option. |

  Bulk generic programmable iBeacon pucks run **$8–15/unit in 20–55 packs** on Amazon — the right path once we're provisioning inventory ourselves.

- Each doctor's beacons share one **UUID per doctor (or per app)** with `major` = doctor/site and `minor` = specific location. iOS can only monitor a limited number of UUID regions in the background, so a single app-wide UUID with major/minor addressing is the scalable design.

### Beacon expiry — pucks are a consumable

Each puck has an **expiry date**; when it lapses the doctor must **buy a new puck** to keep automatic presence working at that location.

- **Expiry is enforced by the backend, not the hardware.** Off-the-shelf pucks have no built-in expiry, so the `beacons` row carries `expires_at`; `report-arrival` and `keepalive` **reject sightings from expired beacons**, and the location silently stops updating (manual status still works).
- **Sell pre-provisioned pucks.** To make repurchase enforceable, we (the business) buy pucks in bulk, program each with a unique app-owned identity, record identity + `expires_at` in the DB, and sell them. Only identities in our catalog can be registered — a doctor can't sidestep expiry by re-flashing a generic beacon or re-registering an old one, because expired identities stay burned in the catalog.
- **Renewal UX — doctor side:** push + SMS reminders at 30 / 7 / 0 days before expiry ("Your Sunrise Clinic beacon expires Friday — order a replacement"); in-app reorder link; new puck arrives → doctor taps "Replace beacon" on the location → old identity retired, new one attached. Battery life (~4 yr on CR2477 hardware) naturally exceeds any 1–2 year expiry term, so hardware never dies before the subscription does.
- **Renewal UX — patient side (gifting):** when a doctor's puck expires (or is about to), the doctor's **followers are prompted too**: the doctor's card on the live board shows "Dr. Mehta's presence beacon has expired" with a **"Gift a new puck"** action. Any patient can buy a replacement puck as a gift; it ships to the doctor's registered clinic address, and the doctor activates it with the normal "Replace beacon" flow. Either path — doctor buys or patient gifts — restores automatic presence.

### Provisioning flow in-app

Doctor taps "Add a place" → app scans for the nearest new puck → validates it against the catalog (unregistered, unexpired) → doctor names it ("Sunrise Clinic, Room 2") and optionally attaches an address → beacon is registered to that doctor+location in the backend.

### Platform realities (drives the tech choices below)

| Concern | iOS | Android |
|---|---|---|
| Background detection | **iBeacon region monitoring via Core Location** — the OS wakes the app on region entry/exit even if the app was killed. This is the reliable path on iOS; raw BLE background scanning is not. | Foreground service or periodic scanning (WorkManager + BLE scan with hardware filters). Region-style monitoring available via libraries. |
| Permissions | Location "Always" + Bluetooth | `BLUETOOTH_SCAN`, location, `FOREGROUND_SERVICE`, notification permission |
| Exit latency | OS region-exit fires ~30 s–few min after last sighting | Depends on scan interval (configurable, battery trade-off) |

Consequence: the beacon-loss "gone" window can't be instant; ~1–5 minutes is realistic and is why the server-side loss window defaults to 5 minutes.

---

## 2. What the app does

### Patient experience
- Open the app and immediately see **where each doctor is right now** — which clinic/office, since when, and (if the doctor entered one) until when: *"Dr. Mehta · Sunrise Clinic · until ~3:30 pm"*.
- Browse doctors by specialty, location, or name.
- Status vocabulary: **At <location> · On call · Away · Off duty**, with expected-until time when known.
- **Follow** favorite doctors → push notification the moment their beacon is detected ("Dr. Mehta just arrived at Sunrise Clinic").
- If contact with a doctor's phone is lost, the board keeps showing the **last known location**, qualified with "as of 2:10 pm" so patients know it's unconfirmed.
- View a doctor's typical weekly schedule alongside live, beacon-derived status.

### Doctor experience
- **Zero-tap presence:** walk in, phone hears the beacon, status updates itself.
- On arrival, a notification/prompt to optionally enter **how long they'll be there**; expiry auto-clears their presence.
- **Beacon management:** add/name/remove beacons ("my places"), see each beacon's last-heard time and battery (where hardware reports it).
- Manual override controls for beacon-less situations.
- Weekly recurring schedule (planned hours) for patient expectations.
- Auto-reminders when scheduled hours start but no beacon has been heard (phase 2).

### Backend dashboard (admin web app)
A web dashboard for operators with **full user management**:
- **Users:** list/search/filter all accounts (doctor/patient/admin), view profile & auth providers, create users, edit details, change roles, trigger password resets, suspend/reactivate, and delete accounts.
- **Doctors:** verify/unverify doctor accounts (gates appearance on the patient board), manage clinic addresses.
- **Beacon operations:** provision new pucks into `beacon_catalog`, set/extend expiry, retire identities, view `puck_orders` and mark shipped.
- **Presence oversight:** live view of all presence rows, force-clear a stuck presence, see keep-alive health and `sms_alerts` history.
- **Audit:** every admin action logged.

---

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Mobile app | **React Native with Expo (dev-client / prebuild)** — TypeScript | Single codebase for iOS + Android. Beacon scanning needs native modules, so we use an Expo **development build** (not Expo Go) with config plugins. |
| Beacon detection | **iOS:** iBeacon region monitoring (Core Location) · **Android:** BLE scanning with hardware filters via a beacons library (e.g., `react-native-beacons-manager` or a thin custom module over AltBeacon / Core Location) | Region monitoring is the only iOS mechanism that survives app termination; Android side uses filtered scans + foreground service. |
| Navigation | Expo Router | File-based routing, role-aware layouts. |
| Backend & DB | **Supabase** (Postgres + Auth + Realtime + Edge Functions + scheduled functions) | Realtime pushes live-board updates to patients; **scheduled/edge functions run the server-side timers** (duration expiry, beacon-loss window); RLS separates doctor/patient roles. |
| Auth | **Supabase Auth: Sign in with Apple, Google OAuth, email/password** | Both apps offer all three. Apple's App Store rules require Sign in with Apple whenever third-party login is offered on iOS. Doctors additionally verify a phone number during onboarding (needed for lost-contact SMS). |
| Admin dashboard | **Next.js web app** on Supabase (service-role API routes) | Full user management, doctor verification, beacon catalog/provisioning, orders, presence oversight, audit log. |
| Push notifications | Expo Push Notifications | Arrival notifications to followers; duration prompts to doctors. |
| SMS alerts | **Twilio** (called from a Supabase Edge Function) | Alerts the doctor when keep-alives stop; an inbound-SMS webhook parses KEEP/GONE replies to update status without the app. |
| State/data | TanStack Query + Supabase JS client | Optimistic updates, realtime cache invalidation. |
| Styling | NativeWind | Fast, consistent styling. |
| Distribution | EAS Build → TestFlight / Play internal track | Standard Expo pipeline; background-location entitlement handled in EAS config. |

---

## 4. Data model (Postgres)

```
profiles          id (= auth.uid), role ('doctor' | 'patient' | 'admin'),
                  full_name, phone, avatar_url, created_at

doctors           id, profile_id → profiles, specialty, bio, verified (bool)

locations         id, doctor_id → doctors, name ("Sunrise Clinic, Room 2"),
                  address, geo (lat/lng, optional), created_at

beacon_catalog    id, uuid, major, minor, sku, provisioned_at,
                  sold_at, expires_at, retired (bool)
                  -- every puck we ever programmed and sold; source of truth for
                  -- which identities are valid. UNIQUE (uuid, major, minor)

beacons           id, catalog_id → beacon_catalog, location_id → locations,
                  label, registered_at, last_seen_at,
                  battery_pct (nullable), active (bool)
                  -- a doctor's registration of a purchased puck to a place;
                  -- expiry comes from beacon_catalog.expires_at

presence          id, doctor_id, location_id (nullable for manual/on-call states),
                  status ('present' | 'on_call' | 'away' | 'off_duty'),
                  source ('beacon' | 'manual'),
                  started_at,
                  expected_until    -- doctor-entered duration → absolute expiry, nullable
                  last_beacon_seen_at,
                  unconfirmed (bool, default false)  -- phone contact lost; showing last known state
                  ended_at (null while current)
                  -- one open row (ended_at IS NULL) per doctor

beacon_sightings  id, beacon_id, doctor_id, rssi, seen_at
                  -- heartbeat log from phones; pruned after N days

schedules         id, doctor_id, weekday (0-6), start_time, end_time, location_id

follows           id, patient_profile_id, doctor_id, notify (bool), created_at

puck_orders       id, catalog_id → beacon_catalog (nullable until fulfilled),
                  doctor_id → doctors (recipient),
                  purchaser_profile_id → profiles (doctor or gifting patient),
                  gift (bool), ship_to (address), status
                  ('pending' | 'paid' | 'shipped' | 'activated'),
                  created_at
                  -- one row per replacement purchase, doctor-bought or patient-gifted

devices           id, profile_id, expo_push_token, platform,
                  last_keepalive_at, updated_at
                  -- keep-alive freshness per device; doctors' SMS number lives on profiles.phone

sms_alerts        id, doctor_id, presence_id, sent_at, reply ('keep'|'gone'|null), replied_at
                  -- audit of lost-contact alerts and doctor responses
```

**Presence state machine (server-side)**

| Event | Effect |
|---|---|
| Arrival event (phone reports beacon entry) | Close any open presence; open new `presence` row (`source='beacon'`, `location_id` from beacon); notify followers; push duration prompt to doctor. |
| Doctor enters duration | Set `expected_until = now() + duration`. |
| Heartbeat / sighting | Update `presence.last_beacon_seen_at`, `beacons.last_seen_at`, `devices.last_keepalive_at`. |
| Keep-alive ping (no beacon in range) | Update `devices.last_keepalive_at` only. |
| Scheduled function (runs every minute) | Close presence where `expected_until < now()` (duration rule) **or** — *only while keep-alives are fresh* — `expected_until IS NULL AND last_beacon_seen_at < now() - loss_window` (beacon-silence rule). |
| Keep-alive gap > grace window (default 15 min) | **Hold last known state**: set `presence.unconfirmed = true`, send SMS via Twilio (log in `sms_alerts`). Never auto-close on phone silence alone. |
| SMS reply GONE (or link action) | Close the presence. Reply KEEP: leave it open, still `unconfirmed` until the phone reports again. |
| Keep-alives resume | Clear `unconfirmed`; normal rules resume. |
| Beacon for a different location heard | Close current presence, open new one at the new location. |
| Manual status set by doctor | Close open presence; open `source='manual'` row; beacon events resume control on next arrival. |
| Sighting from an **expired or retired** beacon | Rejected at `report-arrival`/`keepalive`; location stops auto-updating until a replacement puck is registered. |
| Beacon expiry approaching (30/7/0 days) | Scheduled function sends push + SMS reorder reminders to the doctor. |
| Beacon **expires** | Backend retires the identity, prompts the **doctor** (push + SMS reorder link) and the doctor's **followers** (push + "Gift a new puck" banner on the doctor's card). |
| Patient gifts a puck | `puck_orders` row (gift=true) → ships to doctor's clinic address → doctor's "Replace beacon" flow attaches the new identity; followers optionally notified "Dr. Mehta is back online". |

**Row-level security sketch**
- `presence`, `doctors`, `locations`, `schedules`: readable by any authenticated user (patients see the board).
- `beacons`, `beacon_sightings`: readable/writable only by the owning doctor (beacon identifiers are not public — prevents spoofing/tracking).
- Presence writes only via the doctor's own session or service-role edge functions.
- `follows`, `devices`, `sms_alerts`: owner-only.

**Anti-spoofing note:** arrival events are accepted only from the authenticated doctor's own device for beacons registered to that doctor, so another person's phone hearing the beacon has no effect.

---

## 5. App structure

```
app/
  (auth)/            sign-in/sign-up (Apple · Google · email), role selection,
                     doctor onboarding (specialty, clinic, phone verification)
  (patient)/         tabs: Live Board · Search · Following · Profile
  (doctor)/          tabs: My Presence (live status + duration control) ·
                     My Places (beacon provisioning) · Schedule · Profile
  _layout.tsx        routes by profile.role
components/          StatusBadge, DoctorCard, DurationSheet, BeaconScanner…
lib/                 supabase client, queries, realtime hooks,
                     beacons/ (native scanning bridge, arrival reporter, permissions)
supabase/            migrations/, edge-functions/
                       report-arrival/      validates + opens presence, fans out pushes
                       keepalive/           receives beacon heartbeats + idle pings
                       presence-sweeper/    scheduled: duration expiry, loss window,
                                            keep-alive gap → unconfirmed + Twilio SMS
                       sms-webhook/         Twilio inbound: KEEP/GONE replies
                       notify-followers/
```

**End-to-end arrival flow**

1. Phone (background) detects region entry for a registered beacon.
2. App wakes, calls `report-arrival` edge function with beacon identity + auth.
3. Backend validates beacon ownership → closes old presence, opens new one.
4. Supabase Realtime pushes the change → patient Live Boards update instantly.
5. Edge function sends Expo pushes to followers, and a duration-prompt notification to the doctor.
6. Doctor taps the prompt → picks "2 hours" → `expected_until` set.
7. `presence-sweeper` (every minute) ends the presence at expiry, or earlier if beacons go silent with no duration set.

---

## 6. Milestones

### M0 — Project setup (½–1 day)
Expo dev-client scaffold (TypeScript, Expo Router, NativeWind), Supabase project, EAS config with background-location/Bluetooth entitlements, repo hygiene.

### M1 — Auth & roles (2–3 days)
Supabase Auth with **Apple, Google, and email/password** sign-in; role selection; doctor onboarding incl. verified phone number; account linking when the same email arrives via different providers; role-based tab groups.

### M2 — Beacon core, foreground (3–4 days)
- Beacon provisioning UI ("Add a place": scan, name, register).
- Foreground beacon detection on both platforms; arrival reporting; `presence` + sweeper functions; duration prompt sheet.
- **Milestone demo:** walk up to a beacon with the app open → presence flips; walk away → clears after loss window.

### M3 — Background detection & keep-alives (3–5 days, the risky one)
- iOS region monitoring (works when app is killed), Android foreground-service scanning.
- **Keep-alive pipeline:** background pings from the phone, `devices.last_keepalive_at` tracking, sweeper marks presence `unconfirmed` after the grace window.
- Permission onboarding flows ("Always" location rationale screens).
- Battery + reliability testing on physical devices. **Hardware needed: 2–3 iBeacon tags, one iPhone, one Android phone.**

### M4 — Patient live board & realtime (2–3 days)
Live board grouped by doctor with location + "until" time, realtime subscription, search/filter, doctor detail with schedule.

### M5 — Follows, push & SMS alerts (2–3 days)
Follow/unfollow, push registration, arrival fan-out, notification preferences. **Twilio integration:** lost-contact SMS to the doctor, inbound webhook for KEEP/GONE replies, "as of" staleness display on the patient board. **Expiry notifications:** 30/7/0-day reminders to the doctor; at expiry, "Gift a new puck" prompt to followers (linking to the order page until the in-app store ships).

### M6 — Manual fallback, schedules & polish (2–3 days)
Manual status controls, weekly schedule editor, beacon health screen (last heard/battery), empty states, icons/splash.

### M7 — Backend dashboard (3–4 days)
Next.js admin web app: user management (search/create/edit/suspend/delete, role changes, password resets), doctor verification, beacon catalog provisioning + expiry management, puck orders, presence oversight, audit log.

### M8 — Beta (1–2 days)
EAS builds → TestFlight + Play internal testing; Sentry; field test in a real clinic with real beacons.

**Phase 2 backlog:** re-prompt/extend when duration expires while beacon still heard, front-desk delegation, shared clinic beacons, walk-in queue, "usually in by…" insights from `beacon_sightings`, beacon battery alerts, **puck store: in-app reorder + patient gifting checkout (Stripe), order fulfillment/shipping states, and an internal pre-provisioning tool for programming and cataloging new inventory**. (Until the store ships, expiry prompts deep-link to a hosted order page.)

---

## 7. Open questions

1. **Duration expiry while still present** — if the timer expires but the phone still hears the beacon, should the system (a) mark the doctor gone anyway (as specified — the duration is authoritative), or (b) re-prompt the doctor to extend? Current spec: **duration is authoritative → marked gone**; re-prompt is listed as phase 2.
2. **Loss window** — is 5 minutes of beacon silence the right default before assuming "gone"? Shorter = faster updates but more false exits (doctor walked to another room).
3. **Keep-alive grace window** — is 15 minutes before the "lost contact" SMS right? iOS may suspend background pings for stretches, so a tighter window risks false alarms; a looser one delays the alert.
4. **How long to hold an unconfirmed state** — if the doctor never answers the SMS, does the last known state persist indefinitely, or auto-clear at end of day / after N hours?
5. **SMS recipients** — doctor only, or also front-desk staff?
6. **Beacon hardware** — start with Blue Charm/Feasycom singles (~$15–21) for development, or go straight to bulk generic pucks ($8–15/unit in 20+ packs) for pre-provisioned inventory?
7. **Expiry term & price** — how long is a puck valid (1 year? 2 years?) and what does a replacement cost? Grace period after expiry before the location goes dark?
8. **Gifting details** — are patients prompted only *after* expiry, or also in the days before? Is the gifter shown to the doctor (and publicly, e.g. "beacon sponsored by a grateful patient") or anonymous? Can multiple patients split/queue gifts, and what happens if the doctor and a patient both buy (credit the extra puck to the doctor's next renewal)?
9. ~~Auth method~~ — **decided:** Apple, Google, and email/password on both apps; doctors also verify an SMS-capable phone number during onboarding.
10. **Doctor verification** — open signup, or admin approval before appearing on the patient board?
11. **Patient accounts** — required to view the board, or only to follow/notify?
12. **Privacy** — doctors' real-time location is sensitive. Visible to all authenticated patients, or only to patients the doctor approves?
13. **Region/compliance** — any data-residency requirement? (Presence ≠ medical records, but confirm.)

---

## 8. Next step

Answer the open questions (or say "use defaults") → **M0 scaffold**, and order 2–3 iBeacon tags so M3 background testing isn't blocked on hardware.
