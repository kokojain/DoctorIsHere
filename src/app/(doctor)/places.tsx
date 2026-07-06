import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PuckScanner } from '@/components/puck-scanner';
import { useAuth } from '@/lib/auth-context';
import { useBeacon } from '@/lib/beacon-context';
import {
  fetchMyPlaces,
  registerPlace,
  removePlace,
  replacePlaceBeacon,
} from '@/lib/presence-api';
import type { PuckIdentity } from '@/lib/qr';
import { BEACON_UUID } from '@/lib/supabase';
import { palette, cardShadow, formatTime } from '@/lib/ui';

/** A beacon heard within this window counts as "here right now". */
const HEARD_NOW_MS = 20_000;

type ScanTarget =
  | { mode: 'add' }
  | { mode: 'replace'; locationId: string; locationName: string };

export default function MyPlacesScreen() {
  const { doctor } = useAuth();
  const beacon = useBeacon();
  const queryClient = useQueryClient();
  const [placeName, setPlaceName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [scannedPuck, setScannedPuck] = useState<PuckIdentity | null>(null);

  const placesQuery = useQuery({
    queryKey: ['my-places', doctor?.id],
    queryFn: () => fetchMyPlaces(doctor!.id),
    enabled: !!doctor,
    refetchInterval: 15_000,
  });

  function invalidatePlaces() {
    queryClient.invalidateQueries({ queryKey: ['my-places'] });
    queryClient.invalidateQueries({ queryKey: ['my-locations'] });
    queryClient.invalidateQueries({ queryKey: ['my-presence'] });
  }

  const registerMutation = useMutation({
    mutationFn: ({ puck, name }: { puck: PuckIdentity; name: string }) =>
      registerPlace(puck, name),
    onSuccess: () => {
      setPlaceName('');
      setScannedPuck(null);
      setFormError(null);
      invalidatePlaces();
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const replaceMutation = useMutation({
    mutationFn: ({ locationId, puck }: { locationId: string; puck: PuckIdentity }) =>
      replacePlaceBeacon(locationId, puck),
    onSuccess: (result) => {
      invalidatePlaces();
      Alert.alert(
        'Puck replaced',
        result.unchanged
          ? 'That puck is already attached to this place.'
          : 'The new puck is active. The old one has been retired and can no longer be used.'
      );
    },
    onError: (error: Error) => Alert.alert('Couldn’t replace puck', error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (locationId: string) => removePlace(locationId),
    onSuccess: invalidatePlaces,
  });

  if (!doctor || placesQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const heardNow =
    beacon.lastSeen && Date.now() - beacon.lastSeen.at < HEARD_NOW_MS ? beacon.lastSeen : null;

  // A puck pending registration: scanned QR wins; otherwise the nearest one heard.
  const pendingPuck: (PuckIdentity & { via: 'scan' | 'radio' }) | null = scannedPuck
    ? { ...scannedPuck, via: 'scan' }
    : heardNow
      ? { uuid: BEACON_UUID.toLowerCase(), major: heardNow.major, minor: heardNow.minor, via: 'radio' }
      : null;

  function handleScanned(puck: PuckIdentity) {
    const target = scanTarget;
    setScanTarget(null);
    if (!target) return;
    if (target.mode === 'add') {
      setScannedPuck(puck);
      setFormError(null);
      return;
    }
    Alert.alert(
      'Replace puck',
      `Attach the scanned puck (#${puck.major}-${puck.minor}) to “${target.locationName}”?\n\nThe current puck will be retired permanently and cannot be reused.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => replaceMutation.mutate({ locationId: target.locationId, puck }),
        },
      ]
    );
  }

  function confirmRemove(locationId: string, name: string) {
    Alert.alert('Remove place', `Remove “${name}” and free its puck?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(locationId) },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Add a place */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a place</Text>

        {pendingPuck ? (
          <>
            <View style={styles.puckRow}>
              <Text style={styles.detected}>
                Puck #{pendingPuck.major}-{pendingPuck.minor}{' '}
                {pendingPuck.via === 'scan' ? 'scanned' : 'detected nearby'}
              </Text>
              {pendingPuck.via === 'scan' && (
                <Pressable onPress={() => setScannedPuck(null)} hitSlop={8}>
                  <Text style={styles.clearScan}>clear</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder='Name this place (e.g. "Sunrise Clinic, Room 2")'
              placeholderTextColor={palette.textMuted}
              value={placeName}
              onChangeText={setPlaceName}
            />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={[styles.primaryButton, !placeName.trim() && styles.buttonDisabled]}
              disabled={!placeName.trim() || registerMutation.isPending}
              onPress={() =>
                registerMutation.mutate({
                  puck: { uuid: pendingPuck.uuid, major: pendingPuck.major, minor: pendingPuck.minor },
                  name: placeName,
                })
              }>
              {registerMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonLabel}>Register this puck</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={styles.primaryButton}
              onPress={() => setScanTarget({ mode: 'add' })}>
              <Text style={styles.primaryButtonLabel}>⌞⌝  Scan puck code</Text>
            </Pressable>
            <Text style={styles.cardLine}>
              {beacon.available
                ? 'Scan the QR code on the new puck — or just stand near it and it will appear here.'
                : 'Scan the QR code printed on the new puck.'}
            </Text>
          </>
        )}
      </View>

      {/* Registered places */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My places</Text>
        {(placesQuery.data ?? []).length === 0 ? (
          <Text style={styles.cardLine}>No places yet.</Text>
        ) : (
          (placesQuery.data ?? []).map((place) => (
            <View key={place.id} style={styles.placeRow}>
              <View style={styles.placeText}>
                <Text style={styles.placeName}>{place.name}</Text>
                <Text style={styles.cardLine}>
                  {place.beacon
                    ? place.beacon.last_seen_at
                      ? `Puck active · last heard ${formatTime(place.beacon.last_seen_at)}`
                      : 'Puck registered — not heard yet'
                    : 'No puck attached'}
                </Text>
                <View style={styles.placeActions}>
                  <Pressable
                    style={styles.replaceButton}
                    disabled={replaceMutation.isPending}
                    onPress={() =>
                      setScanTarget({
                        mode: 'replace',
                        locationId: place.id,
                        locationName: place.name,
                      })
                    }>
                    <Text style={styles.replaceButtonLabel}>
                      {place.beacon ? '⌞⌝  Replace puck' : '⌞⌝  Attach puck'}
                    </Text>
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    disabled={removeMutation.isPending}
                    onPress={() => confirmRemove(place.id, place.name)}>
                    <Text style={styles.remove}>Remove place</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <PuckScanner
        visible={scanTarget != null}
        title={
          scanTarget?.mode === 'replace'
            ? `Scan the new puck for ${scanTarget.locationName}`
            : 'Scan the new puck’s QR code'
        }
        onScanned={handleScanned}
        onClose={() => setScanTarget(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 18,
    gap: 12,
    ...cardShadow,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: palette.text },
  cardLine: { fontSize: 13, color: palette.textMuted, lineHeight: 19 },
  puckRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detected: { fontSize: 14, fontWeight: '600', color: palette.present },
  clearScan: { fontSize: 13, color: palette.textMuted, textDecorationLine: 'underline' },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: palette.text,
    backgroundColor: palette.background,
  },
  error: { color: palette.danger, fontSize: 13 },
  primaryButton: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  placeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  placeText: { flex: 1, gap: 4 },
  placeName: { fontSize: 16, fontWeight: '600', color: palette.text },
  placeActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 },
  replaceButton: {
    borderWidth: 1,
    borderColor: palette.primary,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  replaceButtonLabel: { fontSize: 13, fontWeight: '600', color: palette.primary },
  remove: { color: palette.danger, fontSize: 13, fontWeight: '600' },
});
