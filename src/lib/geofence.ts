import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { supabase } from './supabase';

const GEOFENCE_TASK = 'dih-manual-checkout';

/**
 * Fires when the doctor leaves the checkout radius around a manual check-in.
 * Defined at module scope so it's re-registered on headless app relaunches —
 * this file is imported for its side effect from the root layout.
 */
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { eventType } = data as { eventType: Location.GeofencingEventType };
  if (eventType !== Location.GeofencingEventType.Exit) return;

  try {
    const { data: result } = await supabase.rpc('gps_check_out');
    if (result?.ok) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Checked out',
          body: `You left ${result.location_name ?? 'your location'} — patients now see you as away.`,
          sound: 'default',
        },
        trigger: null,
      });
    }
    await stopManualCheckoutFence();
  } catch {
    // Next exit event (or the doctor's own Check out tap) will retry.
  }
});

/** Arms the checkout geofence around a manual check-in's GPS anchor. */
export async function startManualCheckoutFence(
  latitude: number,
  longitude: number,
  radiusMeters: number
): Promise<void> {
  await Location.startGeofencingAsync(GEOFENCE_TASK, [
    {
      identifier: GEOFENCE_TASK,
      latitude,
      longitude,
      radius: radiusMeters,
      notifyOnEnter: false,
      notifyOnExit: true,
    },
  ]);
}

export async function stopManualCheckoutFence(): Promise<void> {
  if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
}

/** Best-effort current position; null when permissions/GPS are unavailable. */
export async function getCurrentCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}
