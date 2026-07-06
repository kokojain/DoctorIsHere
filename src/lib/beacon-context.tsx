import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { useAuth } from './auth-context';
import { ensureNotificationPermission } from './notifications';
import { useBeaconPresence, type BeaconPresenceState } from './use-beacon-presence';

const BeaconContext = createContext<BeaconPresenceState>({
  available: false,
  authorization: 'unavailable',
  lastSeen: null,
});

/**
 * One beacon listener for the whole doctor tab group — My Presence shows
 * diagnostics from it and My Places uses it to provision the nearest beacon.
 */
export function BeaconProvider({ children }: { children: ReactNode }) {
  const { doctor } = useAuth();
  const state = useBeaconPresence(!!doctor);

  // The native module posts a local "you've arrived" notification on region
  // entry while backgrounded — that needs notification permission up front.
  useEffect(() => {
    if (doctor) ensureNotificationPermission();
  }, [doctor]);

  return <BeaconContext.Provider value={state}>{children}</BeaconContext.Provider>;
}

export function useBeacon() {
  return useContext(BeaconContext);
}
