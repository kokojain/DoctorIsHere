import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { registerForPush } from '@/lib/notifications';
import {
  fetchBoard,
  registerDevice,
  setFollow,
  subscribeToPresence,
} from '@/lib/presence-api';
import type { BoardDoctor } from '@/lib/types';
import { palette, formatTime } from '@/lib/ui';

export default function LiveBoardScreen() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const boardQuery = useQuery({
    queryKey: ['board', profile?.id],
    queryFn: () => fetchBoard(profile!.id),
    enabled: !!profile,
  });

  // Realtime: any presence change refreshes the board.
  useEffect(() => {
    const unsubscribe = subscribeToPresence(() => {
      queryClient.invalidateQueries({ queryKey: ['board'] });
    });
    return unsubscribe;
  }, [queryClient]);

  // Push registration — never blocks the board (returns null on simulator etc.)
  useEffect(() => {
    if (!profile) return;
    registerForPush().then((token) => {
      if (token) registerDevice(profile.id, token).catch(() => {});
    });
  }, [profile]);

  const followMutation = useMutation({
    mutationFn: ({ doctorId, follow }: { doctorId: string; follow: boolean }) =>
      setFollow(profile!.id, doctorId, follow),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['board'] }),
  });

  if (!profile || boardQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={boardQuery.data ?? []}
      keyExtractor={(item) => item.doctor_id}
      refreshControl={
        <RefreshControl
          refreshing={boardQuery.isRefetching}
          onRefresh={() => boardQuery.refetch()}
        />
      }
      ListEmptyComponent={
        <Text style={styles.empty}>No doctors yet — run the seed script.</Text>
      }
      renderItem={({ item }) => (
        <DoctorCard
          doctor={item}
          onToggleFollow={() =>
            followMutation.mutate({ doctorId: item.doctor_id, follow: !item.followed })
          }
        />
      )}
    />
  );
}

function DoctorCard({
  doctor,
  onToggleFollow,
}: {
  doctor: BoardDoctor;
  onToggleFollow: () => void;
}) {
  const presence = doctor.presence;
  const isPresent = presence != null;
  const isUnconfirmed = presence?.unconfirmed ?? false;

  let statusText = 'Away';
  let detailText = 'Not currently at a location';
  if (presence) {
    statusText = isUnconfirmed ? `At ${doctor.location_name ?? '…'} (unconfirmed)` : `At ${doctor.location_name ?? '…'}`;
    const since = `since ${formatTime(presence.started_at)}`;
    const until = presence.expected_until
      ? ` · until ~${formatTime(presence.expected_until)}`
      : '';
    const asOf = isUnconfirmed && presence.last_beacon_seen_at
      ? ` · as of ${formatTime(presence.last_beacon_seen_at)}`
      : '';
    detailText = `${since}${until}${asOf}`;
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.doctorName}>{doctor.full_name}</Text>
          {doctor.specialty ? (
            <Text style={styles.specialty}>{doctor.specialty}</Text>
          ) : null}
        </View>
        <Pressable onPress={onToggleFollow} hitSlop={8}>
          <Text style={styles.follow}>{doctor.followed ? '★' : '☆'}</Text>
        </Pressable>
      </View>
      <View
        style={[
          styles.statusPill,
          {
            backgroundColor: isPresent
              ? isUnconfirmed
                ? palette.unconfirmedBg
                : palette.presentBg
              : palette.awayBg,
          },
        ]}>
        <Text
          style={[
            styles.statusPillText,
            {
              color: isPresent
                ? isUnconfirmed
                  ? palette.unconfirmed
                  : palette.present
                : palette.away,
            },
          ]}>
          {statusText}
        </Text>
      </View>
      <Text style={styles.detail}>{detailText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: palette.textMuted, marginTop: 48 },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  cardHeaderText: { flex: 1, gap: 2 },
  doctorName: { fontSize: 18, fontWeight: '700', color: palette.text },
  specialty: { fontSize: 13, color: palette.textMuted },
  follow: { fontSize: 26, color: palette.primary },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusPillText: { fontSize: 14, fontWeight: '700' },
  detail: { fontSize: 13, color: palette.textMuted },
});
