import { useEffect, useRef, useState } from 'react';

import * as BeaconMonitor from '../../modules/beacon-monitor';
import { reportBeacon } from './presence-api';
import { BEACON_UUID } from './supabase';

const SIGHTING_INTERVAL_MS = 20_000;

export interface BeaconPresenceState {
  available: boolean;
  authorization: BeaconMonitor.AuthorizationStatus;
  lastSeen: { major: number; minor: number; at: number } | null;
}

/**
 * Listens for DoctorIsHere beacons and reports arrivals/heartbeat sightings
 * to the backend. A new (or different) beacon → 'arrival'; the same beacon
 * → 'sighting' every SIGHTING_INTERVAL_MS. Departure is decided server-side
 * (duration expiry or beacon-silence sweep), never by the phone.
 */
export function useBeaconPresence(enabled: boolean): BeaconPresenceState {
  const [authorization, setAuthorization] = useState<BeaconMonitor.AuthorizationStatus>(
    BeaconMonitor.getAuthorizationStatus()
  );
  const [lastSeen, setLastSeen] = useState<BeaconPresenceState['lastSeen']>(null);
  const lastReport = useRef<{ key: string; at: number } | null>(null);
  const reporting = useRef(false);

  useEffect(() => {
    if (!enabled || !BeaconMonitor.isAvailable()) return;
    let disposed = false;

    (async () => {
      await BeaconMonitor.requestAlwaysAuthorization();
      await BeaconMonitor.startMonitoring(BEACON_UUID);
    })();

    const authSub = BeaconMonitor.addAuthorizationListener(({ status }) => {
      if (!disposed) setAuthorization(status);
    });

    const beaconSub = BeaconMonitor.addBeaconsListener(async ({ beacons }) => {
      if (disposed || beacons.length === 0 || reporting.current) return;
      const nearest = [...beacons].sort((a, b) => b.rssi - a.rssi)[0];
      setLastSeen({ major: nearest.major, minor: nearest.minor, at: Date.now() });

      const key = `${nearest.uuid}/${nearest.major}/${nearest.minor}`;
      const now = Date.now();
      const prev = lastReport.current;
      const kind: 'arrival' | 'sighting' | null =
        !prev || prev.key !== key
          ? 'arrival'
          : now - prev.at >= SIGHTING_INTERVAL_MS
            ? 'sighting'
            : null;
      if (!kind) return;

      reporting.current = true;
      lastReport.current = { key, at: now };
      try {
        await reportBeacon(kind, nearest);
      } catch {
        lastReport.current = prev; // retry on the next ranging tick
      } finally {
        reporting.current = false;
      }
    });

    return () => {
      disposed = true;
      authSub.remove();
      beaconSub.remove();
      BeaconMonitor.stopMonitoring();
    };
  }, [enabled]);

  return { available: BeaconMonitor.isAvailable(), authorization, lastSeen };
}
