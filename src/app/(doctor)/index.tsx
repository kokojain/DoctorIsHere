import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DurationSheet } from '@/components/duration-sheet';
import { useAuth } from '@/lib/auth-context';
import { useBeacon } from '@/lib/beacon-context';
import {
  clearMyPresence,
  fetchMyLocations,
  fetchMyOpenPresence,
  manualCheckIn,
  setExpectedUntil,
  subscribeToPresence,
} from '@/lib/presence-api';
import { palette, cardShadow, formatTime, greeting } from '@/lib/ui';

export default function MyPresenceScreen() {
  const { doctor, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const beacon = useBeacon();
  const [dismissedPromptFor, setDismissedPromptFor] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  const presence = presenceQuery.data ?? null;

  // A fresh beacon arrival with no timer → offer the clock once.
  const needsPrompt =
    presence != null &&
    presence.source === 'beacon' &&
    presence.expected_until == null &&
    dismissedPromptFor !== presence.id;

  useEffect(() => {
    if (needsPrompt) setSheetOpen(true);
  }, [needsPrompt]);

  if (!doctor || presenceQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['my-presence'] });
    } finally {
      setBusy(false);
    }
  }

  const permissionProblem =
    beacon.available && (beacon.authorization === 'denied' || beacon.authorization === 'restricted');

  const firstName = profile?.full_name?.split(' ').slice(-1)[0] ?? '';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}>
      {/* Greeting */}
      <View>
        <Text style={styles.greeting}>{greeting()},</Text>
        <Text style={styles.name}>{profile?.full_name}</Text>
      </View>

      {/* Only surfaced when something actually needs the doctor's attention */}
      {permissionProblem && (
        <Pressable style={styles.banner} onPress={() => Linking.openSettings()}>
          <Text style={styles.bannerText}>
            Location permission is off, so automatic check-in can’t work. Tap to open
            Settings.
          </Text>
        </Pressable>
      )}

      {/* Hero status */}
      <View
        style={[
          styles.hero,
          presence ? styles.heroPresent : styles.heroAway,
        ]}>
        <View style={[styles.statusDot, { backgroundColor: presence ? palette.present : palette.away }]} />
        <Text style={[styles.heroStatus, { color: presence ? palette.present : palette.away }]}>
          {presence ? 'Checked in' : 'Not checked in'}
        </Text>
        {presence ? (
          <>
            <Text style={styles.heroLocation}>{presence.location_name ?? 'Unknown place'}</Text>
            <Text style={styles.heroMeta}>
              since {formatTime(presence.started_at)}
              {presence.expected_until ? `  ·  until ~${formatTime(presence.expected_until)}` : ''}
            </Text>
            <View style={styles.heroActions}>
              <Pressable
                style={styles.heroButton}
                disabled={busy}
                onPress={() => setSheetOpen(true)}>
                <Text style={styles.heroButtonLabel}>
                  {presence.expected_until ? 'Change time' : 'Set leave time'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.heroButton, styles.heroButtonQuiet]}
                disabled={busy}
                onPress={() => run(() => clearMyPresence(doctor.id))}>
                <Text style={[styles.heroButtonLabel, { color: palette.danger }]}>Check out</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={styles.heroHint}>
            {beacon.available
              ? 'Walk into one of your places and you’ll be checked in automatically.'
              : 'You’ll be checked in automatically when your phone hears a clinic beacon.'}
          </Text>
        )}
      </View>

      {/* Manual check-in */}
      {!presence && (locationsQuery.data ?? []).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Check in manually</Text>
          {(locationsQuery.data ?? []).map((location) => (
            <Pressable
              key={location.id}
              style={styles.locationButton}
              disabled={busy}
              onPress={() => run(() => manualCheckIn(doctor.id, location.id))}>
              <Text style={styles.locationButtonLabel}>{location.name}</Text>
              <Text style={styles.locationButtonChevron}>›</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* The clock */}
      <DurationSheet
        visible={sheetOpen && presence != null}
        locationName={presence?.location_name ?? 'this location'}
        initialMinutes={60}
        onConfirm={(minutes) => {
          setSheetOpen(false);
          if (presence) run(() => setExpectedUntil(presence.id, minutes));
        }}
        onSkip={() => {
          setSheetOpen(false);
          if (presence) setDismissedPromptFor(presence.id);
        }}
        onClose={() => {
          setSheetOpen(false);
          if (presence && presence.expected_until == null) setDismissedPromptFor(presence.id);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 16, color: palette.textMuted },
  name: { fontSize: 26, fontWeight: '800', color: palette.text },
  banner: {
    backgroundColor: palette.unconfirmedBg,
    borderRadius: 14,
    padding: 14,
  },
  bannerText: { color: palette.unconfirmed, fontSize: 14, fontWeight: '500' },
  hero: {
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.card,
    ...cardShadow,
  },
  heroPresent: { backgroundColor: palette.presentBg },
  heroAway: { backgroundColor: palette.card },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginBottom: 2 },
  heroStatus: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroLocation: { fontSize: 28, fontWeight: '800', color: palette.text, textAlign: 'center' },
  heroMeta: { fontSize: 15, color: palette.textMuted },
  heroHint: {
    fontSize: 15,
    color: palette.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 4,
  },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  heroButton: {
    backgroundColor: palette.primary,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  heroButtonQuiet: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: palette.danger,
  },
  heroButtonLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  section: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 18,
    gap: 10,
    ...cardShadow,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: palette.text, marginBottom: 2 },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.background,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  locationButtonLabel: { fontSize: 16, fontWeight: '600', color: palette.text },
  locationButtonChevron: { fontSize: 20, color: palette.textMuted },
});
