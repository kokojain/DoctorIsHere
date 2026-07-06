# DoctorIsHere — Test Cases

**Covers:** Backend dashboard (admin web) · Doctor app · Patient app
**Companion to:** [PLAN.md](PLAN.md)
**Last updated:** 2026-07-04

Conventions: every case lists preconditions → steps → expected result. IDs are stable — reference them in bug reports.
Prefixes: **AU** auth (both apps) · **BD** backend dashboard · **DA** doctor app · **PA** patient app · **E2E** cross-surface flows.

---

## 0. Test environment & fixtures

- **Devices:** one physical iPhone (background beacon tests do not work in the iOS simulator) and one physical Android phone.
- **Beacons:** ≥3 provisioned test pucks (in `beacon_catalog`): one valid, one expiring soon, one expired. One *unprovisioned* generic beacon for negative tests.
- **Staging config:** timers shortened for testability — beacon-loss window **1 min** (prod 5), keep-alive grace **3 min** (prod 15), plus the ability to set `expires_at` to arbitrary near-future values. Expiry-reminder thresholds runnable on demand.
- **SMS:** Twilio test credentials + one real test number that can receive and reply to SMS.
- **Accounts:** admin account; test Apple ID and Google account; disposable email inboxes.

---

## 1. AU — Authentication & account setup (doctor and patient apps)

| ID | Case | Steps | Expected |
|---|---|---|---|
| AU-01 | Email sign-up (patient) | Sign up with email + password → open verification email → verify | Account created, `profiles.role='patient'` after role selection, lands on patient Live Board |
| AU-02 | Email sign-up (doctor) | Same as AU-01, choose Doctor role → complete onboarding (name, specialty, clinic, phone) | Doctor profile created `verified=false`; not yet visible on patient board; phone OTP verified and stored |
| AU-03 | Sign in with Apple — new user | Tap "Continue with Apple" on iPhone, allow | Account created via Apple identity; role selection shown; works with "Hide My Email" relay address |
| AU-04 | Sign in with Google — new user | Tap "Continue with Google", pick account | Account created; role selection shown |
| AU-05 | Sign in with Apple/Google — returning user | Sign out, sign back in with same provider | Same account resumed (no duplicate profile); lands on correct role's tabs |
| AU-06 | Same email, different provider | Sign up with email me@x.com; later use Google login for me@x.com | Accounts linked or a clear "account exists — sign in with email" message; **never** a second profile with the same email |
| AU-07 | Wrong password | Email sign-in with bad password ×3 | Clear error, no lockout surprise; rate limiting after repeated attempts |
| AU-08 | Password reset | "Forgot password" → email link → set new password | Old password invalid, new one works; active sessions handled per policy |
| AU-09 | Unverified email blocked | Sign up with email, skip verification, try to use app | Gated with "verify your email" prompt and resend option |
| AU-10 | Doctor phone verification required | Doctor onboarding: enter phone, receive OTP, enter wrong then right code | Wrong code rejected; right code stores verified number; onboarding cannot complete without it |
| AU-11 | Sign out | Sign out from profile tab | Session cleared; push token deregistered or reassigned on next login; protected screens unreachable |
| AU-12 | Suspended account | Admin suspends user (BD-07) → user attempts sign-in / has live session | Sign-in refused with message; live session invalidated on next API call |
| AU-13 | Deleted account | Admin deletes user (BD-08) → attempt sign-in with old credentials/providers | No account; re-signup creates a fresh empty profile |
| AU-14 | Role routing | Sign in as doctor, then as patient | Doctor lands on My Presence tabs, patient on Live Board tabs; neither can navigate to the other's tab group |
| AU-15 | Apple review rule | Build offering Google + email on iOS | "Sign in with Apple" also present (App Store requirement) |

---

## 2. BD — Backend dashboard (admin web)

### 2.1 Access control

| ID | Case | Steps | Expected |
|---|---|---|---|
| BD-01 | Admin login | Sign in with admin account | Dashboard loads |
| BD-02 | Non-admin blocked | Sign in with doctor/patient credentials on the dashboard URL | Access denied; no data leaks in network responses (service-role endpoints check role server-side) |
| BD-03 | Direct API probe | Call an admin API route with a patient JWT | 403; RLS/service-role checks hold |

### 2.2 User management

| ID | Case | Steps | Expected |
|---|---|---|---|
| BD-04 | List & search users | Open Users; search by name, email, phone, role filter | Correct results, pagination works |
| BD-05 | View user detail | Open a user | Profile, role, linked auth providers (Apple/Google/email), devices/last keep-alive, created date |
| BD-06 | Create user | Create a patient and a doctor from the dashboard | Accounts usable; invited via email; doctor starts `verified=false` |
| BD-07 | Suspend / reactivate | Suspend a doctor → verify AU-12 → reactivate | Suspension immediate; doctor's presence hidden from patient board while suspended; reactivation restores |
| BD-08 | Delete user | Delete a test patient | Auth identity + profile removed; follows and push tokens cascade; audit row written |
| BD-09 | Change role | Promote a patient to admin; demote back | Takes effect on next session; audit row written |
| BD-10 | Trigger password reset | Send reset from dashboard for an email-auth user | User receives email; works end to end |
| BD-11 | Verify doctor | Verify a pending doctor | Doctor now appears on patient board (E2E-01 confirms) |
| BD-12 | Audit log | Perform BD-06→BD-11 | Each action logged with actor, target, timestamp, before/after |

### 2.3 Beacon catalog & orders

| ID | Case | Steps | Expected |
|---|---|---|---|
| BD-13 | Provision puck | Add new identity (uuid/major/minor, sku, expires_at) | Appears in catalog as unsold; duplicate identity rejected (unique constraint) |
| BD-14 | Edit expiry | Extend `expires_at` on a sold puck | New date effective; pending expiry reminders recalculated |
| BD-15 | Retire puck | Retire an active puck | Sightings from it rejected immediately (DA-22 behavior); doctor notified |
| BD-16 | Orders board | View `puck_orders`; mark one shipped | Status transitions pending→paid→shipped visible to purchaser in-app |

### 2.4 Presence oversight

| ID | Case | Steps | Expected |
|---|---|---|---|
| BD-17 | Live presence view | Open Presence while a test doctor is checked in | Row shows doctor, location, source, started_at, expected_until, unconfirmed flag, last keep-alive |
| BD-18 | Force-clear presence | Force-clear a stuck presence | Presence ends, patient board updates in realtime, audit row written |
| BD-19 | SMS alert history | Trigger a lost-contact alert (DA-16) → open sms_alerts | Row with sent_at and reply status |

---

## 3. DA — Doctor app

### 3.1 Beacon provisioning ("My Places")

| ID | Case | Steps | Expected |
|---|---|---|---|
| DA-01 | Add a place | "Add a place" near the valid test puck → name it | Beacon registered to doctor+location; appears in My Places with last-seen time |
| DA-02 | Unprovisioned beacon rejected | Attempt DA-01 with the generic (non-catalog) beacon | Rejected: "not a DoctorIsHere puck" |
| DA-03 | Already-registered beacon rejected | Second doctor attempts to register the puck from DA-01 | Rejected: already owned |
| DA-04 | Expired puck rejected at registration | Attempt DA-01 with the expired test puck | Rejected with reorder link |
| DA-05 | Remove a place | Delete a place | Beacon released per policy (retired, not re-registerable by others); presence at that place cleared |

### 3.2 Presence — arrival, duration, departure

| ID | Case | Steps | Expected |
|---|---|---|---|
| DA-06 | Foreground arrival | App open, walk into range of registered puck | Presence opens ≤10 s; My Presence shows location; duration prompt appears |
| DA-07 | Background arrival (iOS) | App **killed**, walk into range | iOS wakes app via region monitoring; presence opens; duration-prompt notification received |
| DA-08 | Background arrival (Android) | App backgrounded (foreground service on), walk into range | Same as DA-07 |
| DA-09 | Duration entered → expiry | On arrival choose 2 min (staging) → wait | At expiry presence closes even if beacon still heard (duration is authoritative); board shows gone |
| DA-10 | No duration → beacon loss | Dismiss prompt, walk out of range | After loss window (1 min staging) presence closes |
| DA-11 | Brief signal dropout | Stay in place; hide beacon <loss-window, restore | No gone/arrive flapping; presence continuous |
| DA-12 | Move between locations | Walk from puck A's range to puck B's | Presence at A closes, B opens; single open presence row at all times |
| DA-13 | Manual status | Set "Away until 3 pm" manually | Overrides beacon state; next beacon arrival resumes automatic control |
| DA-14 | Manual for beacon-less place | Manual check-in at a location with no puck | Works; source='manual' shown to patients normally |
| DA-15 | Offline arrival | Airplane mode on phone, walk into range, then restore connectivity | Arrival reported when connectivity returns; no crash; timestamps sane |

### 3.3 Keep-alives & lost contact

| ID | Case | Steps | Expected |
|---|---|---|---|
| DA-16 | Phone dies while present | Check in, then power off phone; wait past grace window (3 min staging) | Presence **stays open**, flagged unconfirmed; doctor's number receives lost-contact SMS; `sms_alerts` row created |
| DA-17 | SMS reply GONE | Reply GONE to DA-16 SMS | Presence closes; patient board updates |
| DA-18 | SMS reply KEEP | Re-run DA-16, reply KEEP | Presence stays open, still unconfirmed until phone returns |
| DA-19 | Phone returns | Power phone back on near the puck | Keep-alives resume, unconfirmed clears, fresh beacon report reconciles state |
| DA-20 | Garbage SMS reply | Reply "hello?" | Help response sent; state unchanged |

### 3.4 Beacon expiry & replacement

| ID | Case | Steps | Expected |
|---|---|---|---|
| DA-21 | Expiry reminders | Set puck to expire in 30/7/0 days (staging); run reminder job | Push + SMS at each threshold with reorder link |
| DA-22 | Expired puck goes dark | Let a registered puck expire; walk into range | Sighting rejected; no presence opens; My Places shows "expired — replace"; manual status still available |
| DA-23 | Replace beacon | Register a fresh valid puck via "Replace beacon" on the location | Old identity retired; location auto-updates again; followers optionally get "back online" |
| DA-24 | Schedule editor | Create weekly schedule Mon/Wed 9–1 | Persists; renders on doctor detail in patient app |

### 3.5 Puck QR scanning & replacement

| ID | Case | Steps | Expected |
|---|---|---|---|
| DA-25 | Add place via QR scan | My Places → Scan puck code → scan a valid unregistered puck's QR → name → register | Place created with that puck; identical result to radio-detect provisioning |
| DA-26 | Foreign QR rejected | Scan a random QR (URL, Wi-Fi code) | "Not a DoctorIsHere puck code" hint; scanner stays open |
| DA-27 | Replace puck | Place → Replace puck → scan a valid new puck → confirm | Old identity `retired=true` in catalog (its sightings rejected from then on — DA-22 behavior); new puck attached; open presence at the place unaffected |
| DA-28 | Replace-puck guards | (a) scan an expired/retired puck (b) scan a puck attached to another place (c) scan the place's own current puck | (a) "expired" error (b) "already registered" error (c) friendly no-op "already attached" |
| DA-29 | Camera permission denied | Deny camera on first scan | Explanatory screen with an Allow button; no crash; radio-detect provisioning still available |

### 3.6 GPS checkout (manual check-ins)

| ID | Case | Steps | Expected |
|---|---|---|---|
| DA-30 | GPS anchor on manual check-in | Manual check-in with location permission granted | Presence stores anchor coords; the place learns lat/lng on its first fix; geofence armed with the server-configured radius (default 500 m) |
| DA-31 | Auto checkout on leaving | While manually checked in, travel > radius away (app backgrounded) | Geofence exit fires; presence closes; doctor gets "Checked out" notification; patient board flips to Away |
| DA-32 | Geofence disarmed correctly | (a) tap Check out manually (b) beacon arrival replaces the manual presence | Fence stopped in both cases; no phantom checkout later |
| DA-33 | No GPS available | Manual check-in with location denied | Check-in still works (no anchor, no fence); presence closes only via manual checkout |

---

## 4. PA — Patient app

| ID | Case | Steps | Expected |
|---|---|---|---|
| PA-01 | Live board realtime | Watch board while test doctor checks in (DA-06) | Card flips to "At Sunrise Clinic" without refresh, ≤ a few seconds |
| PA-02 | "Until" display | Doctor entered a duration | Card shows "until ~HH:MM" |
| PA-03 | Unconfirmed display | Trigger DA-16 | Card keeps last known location with "as of HH:MM" qualifier — never presented as live |
| PA-04 | Gone states | Trigger DA-09 / DA-10 | Card returns to Away/Off duty correctly |
| PA-05 | Search & filter | Search by name; filter by specialty | Correct results; unverified/suspended doctors absent |
| PA-06 | Doctor detail | Open a doctor | Live status, weekly schedule (DA-24), follow button |
| PA-07 | Follow + arrival push | Follow test doctor; trigger arrival | Push "Dr. X just arrived at Y" within seconds; deep-links to doctor detail |
| PA-08 | Unfollow | Unfollow, trigger arrival again | No push |
| PA-09 | Notification preferences | Disable notifications for one followed doctor | Board still updates; no push for that doctor only |
| PA-10 | Expired-beacon gift prompt | Let followed doctor's puck expire | Doctor's card shows expiry banner + **"Gift a new puck"**; follower gets push |
| PA-11 | Gift purchase | Tap gift → complete checkout (test mode) | `puck_orders` row (gift=true, recipient doctor, clinic ship-to); confirmation shown; admin sees order (BD-16) |
| PA-12 | Gift activation loop | Admin ships (BD-16); doctor replaces beacon (DA-23) | Gifter notified "Dr. X is back online" per policy |
| PA-13 | Push permission denied | Decline OS notification permission, follow a doctor | App works; realtime board unaffected; gentle re-prompt path exists |

---

## 5. E2E — Cross-surface scenarios

| ID | Case | Flow | Expected |
|---|---|---|---|
| E2E-01 | New doctor to visible | AU-02 → BD-11 verify → DA-01 provision → DA-06 arrive | Patient board shows doctor live; total flow works on both iOS and Android |
| E2E-02 | Full expiry lifecycle | DA-21 reminders → expiry → DA-22 dark + PA-10 gift prompt → PA-11 gift → BD-16 ship → DA-23 replace → PA-12 back online | Every hop in order; no state stuck |
| E2E-03 | Dead-phone day | DA-06 arrive → phone dies (DA-16) → SMS KEEP (DA-18) → phone returns (DA-19) → end of day beacon loss (DA-10) | Patients saw continuous, honestly-qualified state throughout; no phantom "present" overnight |
| E2E-04 | Suspension mid-presence | Doctor is checked in → BD-07 suspend | Presence hidden from board immediately; doctor app signed out/blocked; reactivation restores cleanly |
| E2E-05 | Spoof attempt | Second doctor's phone (or patient's phone) reports first doctor's beacon identity to `report-arrival` | Rejected — beacon ownership is validated against the authenticated caller; no presence change, attempt logged |

---

## 6. Non-functional checks

| ID | Case | Expected |
|---|---|---|
| NF-01 | Battery drain | 8-hour day with background monitoring: battery impact acceptable (target <5%/day attributable to the app) on both platforms |
| NF-02 | Realtime latency | Arrival → patient board update p95 under 5 s on staging |
| NF-03 | Sweeper accuracy | Duration/loss-window closures fire within 1 sweeper interval (1 min) of their due time |
| NF-04 | Permission onboarding | Fresh installs: iOS "Always" location + Bluetooth and Android scan/notification permission flows are understandable and recover from "denied" gracefully |
| NF-05 | Timezone sanity | Doctor and patient in different timezones see correct local "until"/"as of" times |
