import { requireOptionalNativeModule } from 'expo-modules-core';

export interface RangedBeacon {
  uuid: string;
  major: number;
  minor: number;
  rssi: number;
  proximity: 'immediate' | 'near' | 'far' | 'unknown';
}

export type AuthorizationStatus =
  | 'always'
  | 'whenInUse'
  | 'denied'
  | 'restricted'
  | 'notDetermined'
  | 'unknown'
  | 'unavailable';

interface BeaconMonitorNativeModule {
  getAuthorizationStatus(): AuthorizationStatus;
  requestAlwaysAuthorization(): Promise<void>;
  startMonitoring(uuid: string): Promise<void>;
  stopMonitoring(): Promise<void>;
  addListener(event: string, listener: (payload: any) => void): { remove(): void };
}

// Null on Android/web/Expo Go — callers must check isAvailable().
const native = requireOptionalNativeModule<BeaconMonitorNativeModule>('BeaconMonitor');

export function isAvailable(): boolean {
  return native != null;
}

export function getAuthorizationStatus(): AuthorizationStatus {
  return native?.getAuthorizationStatus() ?? 'unavailable';
}

export async function requestAlwaysAuthorization(): Promise<void> {
  await native?.requestAlwaysAuthorization();
}

export async function startMonitoring(uuid: string): Promise<void> {
  await native?.startMonitoring(uuid);
}

export async function stopMonitoring(): Promise<void> {
  await native?.stopMonitoring();
}

export function addBeaconsListener(
  listener: (event: { beacons: RangedBeacon[] }) => void
): { remove(): void } {
  return native?.addListener('onBeacons', listener) ?? { remove() {} };
}

export function addRegionListener(
  listener: (event: { event: 'enter' | 'exit'; identifier: string }) => void
): { remove(): void } {
  return native?.addListener('onRegionChange', listener) ?? { remove() {} };
}

export function addAuthorizationListener(
  listener: (event: { status: AuthorizationStatus }) => void
): { remove(): void } {
  return native?.addListener('onAuthorization', listener) ?? { remove() {} };
}
