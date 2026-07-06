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

import { useAuth } from '@/lib/auth-context';
import { useBeacon } from '@/lib/beacon-context';
import { fetchMyPlaces, registerPlace, removePlace } from '@/lib/presence-api';
import { BEACON_UUID } from '@/lib/supabase';
import { palette, formatTime } from '@/lib/ui';

/** A beacon heard within this window counts as "here right now". */
const HEARD_NOW_MS = 20_000;

export default function MyPlacesScreen() {
  const { doctor } = useAuth();
  const beacon = useBeacon();
  const queryClient = useQueryClient();
  const [placeName, setPlaceName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const placesQuery = useQuery({
    queryKey: ['my-places', doctor?.id],
    queryFn: () => fetchMyPlaces(doctor!.id),
    enabled: !!doctor,
    refetchInterval: 15_000, // keeps "last heard" fresh
  });

  const registerMutation = useMutation({
    mutationFn: ({ major, minor, name }: { major: number; minor: number; name: string }) =>
      registerPlace({ uuid: BEACON_UUID, major, minor }, name),
    onSuccess: () => {
      setPlaceName('');
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['my-places'] });
      queryClient.invalidateQueries({ queryKey: ['my-locations'] });
    },
    onError: (error: Error) => setFormError(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (locationId: string) => removePlace(locationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-places'] });
      queryClient.invalidateQueries({ queryKey: ['my-locations'] });
      queryClient.invalidateQueries({ queryKey: ['my-presence'] });
    },
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

  function confirmRemove(locationId: string, name: string) {
    Alert.alert('Remove place', `Remove "${name}" and free its beacon?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeMutation.mutate(locationId),
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Add a place — provisioning flow (PLAN.md §1) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a place</Text>
        {heardNow ? (
          <>
            <Text style={styles.detected}>
              Beacon detected — major {heardNow.major} / minor {heardNow.minor}
            </Text>
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
                  major: heardNow.major,
                  minor: heardNow.minor,
                  name: placeName,
                })
              }>
              {registerMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonLabel}>Register this beacon</Text>
              )}
            </Pressable>
          </>
        ) : (
          <Text style={styles.cardLine}>
            {beacon.available
              ? 'Stand near the new beacon — it will appear here when your phone hears it.'
              : 'Beacon detection needs the dev build on a physical iPhone.'}
          </Text>
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
                      ? `Beacon last heard ${formatTime(place.beacon.last_seen_at)}`
                      : 'Beacon registered — not heard yet'
                    : 'No beacon attached'}
                </Text>
              </View>
              <Pressable
                hitSlop={8}
                disabled={removeMutation.isPending}
                onPress={() => confirmRemove(place.id, place.name)}>
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: palette.text },
  cardLine: { fontSize: 13, color: palette.textMuted },
  detected: { fontSize: 14, fontWeight: '600', color: palette.present },
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
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  placeText: { flex: 1, gap: 2 },
  placeName: { fontSize: 16, fontWeight: '600', color: palette.text },
  remove: { color: palette.danger, fontSize: 13, fontWeight: '600' },
});
