# DoctorIsHere

Beacon-based doctor presence tracker: BTLE pucks at each place a doctor works, automatic check-in when the doctor's phone hears one, and a realtime live board + push notifications for patients.

| Doc | What's in it |
|---|---|
| [PLAN.md](PLAN.md) | Full product spec: beacon lifecycle, keep-alive/SMS fallback, puck expiry & gifting, milestones |
| [TEST-CASES.md](TEST-CASES.md) | 76-case test plan across backend dashboard, doctor app, patient app |
| [DEMO.md](DEMO.md) | Runbook for the doctor demo: setup, script, safety valves |

## Stack

Expo (React Native, TypeScript, Expo Router) · custom Expo module for iBeacon monitoring (Swift/CoreLocation, `modules/beacon-monitor`) · Supabase (Postgres, Auth, Realtime, Edge Functions, pg_cron sweeper) · Expo Push.

## Layout

```
src/app/(auth|doctor|patient)/   screens (Expo Router groups, routed by role)
src/lib/                         supabase client, presence API, beacon hook, push
modules/beacon-monitor/          native iBeacon ranging/monitoring (iOS)
supabase/migrations/             schema, RLS, sweep_presence() + pg_cron
supabase/functions/              report-arrival, presence-sweeper
scripts/seed.mjs                 demo doctor/patient/clinic/beacon
```

## Quick start

Needs a dev build (beacon module is native — Expo Go won't work):

```sh
npm install
cp .env.example .env   # fill in Supabase URL + keys
supabase link --project-ref <ref> && supabase db push
supabase functions deploy report-arrival presence-sweeper
node scripts/seed.mjs
eas init && eas build --profile development --platform ios
npx expo start
```

Full walkthrough in [DEMO.md](DEMO.md).
