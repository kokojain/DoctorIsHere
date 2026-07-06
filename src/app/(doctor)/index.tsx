import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth-context';
import {
  clearMyPresence,
  fetchMyLocations,
  fetchMyOpenPresence,
  manualCheckIn,
  setExpectedUntil,
  subscribeToPresence,
} from '@/lib/presence-api';
import { palette, formatTime } from '@/lib/ui';
import { useBeaconPresence } from '@/lib/use-beacon-presence';

const DURATION_CHOICES = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
];

export default function MyPresenceScreen() {
  const { doctor } = useAuth();
  const queryClient = useQueryClient();
  const beacon = useBeaconPresence(!!doctor);
  const [dismissedPromptFor, setDismissedPromptFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const presenceQuery = useQuery({
    queryKey: ['my-presence', doctor?.id],
    queryFn: () => fetchMyOpenPresence(doctor!.id),
    enabled: !!doctor,
  });
  const locationsQuery = useQuery({
    queryKey: ['my-locations', doctor?.id],
    queryFn: () => fetchMyLocations(doctor!.id),
    enabled: !!doctor,
  });

  useEffect(() => {
    const unsubscribe = subscribeToPresence(() => {
      queryClient.invalidateQueries({ queryKey: ['my-presence'] });
    });
    return unsubscribe;
  }, [queryClient]);

  if (!doctor || presenceQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const presence = presenceQuery.data ?? null;
  const showDurationPrompt =
    presence != null &&
    presence.source === 'beacon' &&
    presence.expected_until == null &&
    dismissedPromptFor !== presence.id;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['my-presence'] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Status card */}
      <View
        style={[
          styles.statusCard,
          { backgroundColor: presence ? palette.presentBg : palette.awayBg },
        ]}>
        <Text style={[styles.statusLabel, { color: presence ? palette.present : palette.away }]}>
          {presence ? 'PRESENT' : 'AWAY'}
        </Text>
        {presence ? (
          <>
            <Text style={styles.statusLocation}>{presence.location_name ?? 'Unknown place'}</Text>
            <Text style={styles.statusMeta}>
              since {formatTime(presence.started_at)}
              {presence.expected_until ? ` · until ~${formatTime(presence.expected_until)}` : ''}
              {presence.source === 'beacon' ? ' · via beacon' : ' · manual'}
            </Text>
          </>
        ) : (
          <Text style={styles.statusMeta}>
            Walk near one of your beacons to check in automatically.
          </Text>
        )}
      </View>

      {/* Duration prompt — the "how long will you be here?" moment */}
      {showDurationPrompt && (
        <View style={styles.promptCard}>
          <Text style={styles.promptTitle}>How long will you be here?</Text>
          <View style={styles.promptRow}>
            {DURATION_CHOICES.map((choice) => (
              <Pressable
                key={choice.minutes}
                style={styles.promptButton}
                disabled={busy}
                onPress={() => run(() => setExpectedUntil(presence!.id, choice.minutes))}>
                <Text style={styles.promptButtonLabel}>{choice.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setDismissedPromptFor(presence!.id)}>
            <Text style={styles.promptDismiss}>No timer — I&apos;ll leave when I leave</Text>
          </Pressable>
        </View>
      )}

      {/* Beacon diagnostics */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Beacon</Text>
        <Text style={styles.cardLine}>
          Detection: {beacon.available ? 'active' : 'unavailable (dev build required)'}
        </Text>
        <Text style={styles.cardLine}>Location permission: {beacon.authorization}</Text>
        <Text style={styles.cardLine}>
          Last heard:{' '}
          {beacon.lastSeen
            ? `major ${beacon.lastSeen.major} / minor ${beacon.lastSeen.minor} at ${formatTime(
                new Date(beacon.lastSeen.at).toISOString()
              )}`
            : 'nothing yet'}
        </Text>
      </View>

      {/* Manual fallback — demo safety valve */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Manual override</Text>
        {(locationsQuery.data ?? []).map((location) => (
          <Pressable
            key={location.id}
            style={styles.manualButton}
            disabled={busy}
            onPress={() => run(() => manualCheckIn(doctor.id, location.id))}>
            <Text style={styles.manualButtonLabel}>Check in at {location.name}</Text>
          </Pressable>
        ))}
        {presence && (
          <Pressable
            style={[styles.manualButton, styles.clearButton]}
            disabled={busy}
            onPress={() => {
              run(() => clearMyPresence(doctor.id));
            }}>
            <Text style={[styles.manualButtonLabel, { color: palette.danger }]}>
              Clear my status
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  statusLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  statusLocation: { fontSize: 24, fontWeight: '700', color: palette.text },
  statusMeta: { fontSize: 14, color: palette.textMuted, textAlign: 'center' },
  promptCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: palette.primary,
  },
  promptTitle: { fontSize: 17, fontWeight: '700', color: palette.text, textAlign: 'center' },
  promptRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  promptButton: {
    backgroundColor: palette.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  promptButtonLabel: { color: '#fff', fontWeight: '600' },
  promptDismiss: { color: palette.textMuted, textAlign: 'center', fontSize: 13 },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: palette.text },
  cardLine: { fontSize: 13, color: palette.textMuted },
  manualButton: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  manualButtonLabel: { fontSize: 15, fontWeight: '600', color: palette.primary },
  clearButton: { borderColor: palette.danger },
});
