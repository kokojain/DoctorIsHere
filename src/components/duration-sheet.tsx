import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { DurationDial } from './duration-dial';
import { palette, cardShadow, formatDuration, formatTime } from '@/lib/ui';

const PRESETS = [
  { label: '30 m', minutes: 30 },
  { label: '1 h', minutes: 60 },
  { label: '2 h', minutes: 120 },
  { label: '4 h', minutes: 240 },
];

export function DurationSheet({
  visible,
  locationName,
  initialMinutes = 60,
  onConfirm,
  onSkip,
  onClose,
}: {
  visible: boolean;
  locationName: string;
  initialMinutes?: number;
  onConfirm: (minutes: number) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [minutes, setMinutes] = useState(initialMinutes);

  useEffect(() => {
    if (visible) setMinutes(initialMinutes);
  }, [visible, initialMinutes]);

  const until = new Date(Date.now() + minutes * 60_000).toISOString();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>How long will you be at</Text>
        <Text style={styles.location}>{locationName}?</Text>

        <DurationDial minutes={minutes} onChange={setMinutes} />

        <Text style={styles.until}>Until {formatTime(until)}</Text>
        <Text style={styles.duration}>{formatDuration(minutes)} from now</Text>

        <View style={styles.presets}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.minutes}
              style={[styles.preset, minutes === preset.minutes && styles.presetActive]}
              onPress={() => setMinutes(preset.minutes)}>
              <Text
                style={[
                  styles.presetLabel,
                  minutes === preset.minutes && styles.presetLabelActive,
                ]}>
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.confirm} onPress={() => onConfirm(minutes)}>
          <Text style={styles.confirmLabel}>Set — leaving around {formatTime(until)}</Text>
        </Pressable>
        <Pressable onPress={onSkip} hitSlop={8}>
          <Text style={styles.skip}>No timer — I’ll leave when I leave</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 32, 44, 0.45)',
  },
  sheet: {
    backgroundColor: palette.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 6,
    ...cardShadow,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.border,
    marginBottom: 12,
  },
  title: { fontSize: 16, color: palette.textMuted },
  location: { fontSize: 22, fontWeight: '700', color: palette.text, marginBottom: 14 },
  until: { fontSize: 24, fontWeight: '700', color: palette.text, marginTop: 14 },
  duration: { fontSize: 14, color: palette.textMuted },
  presets: { flexDirection: 'row', gap: 8, marginTop: 12 },
  preset: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  presetActive: { backgroundColor: palette.primary, borderColor: palette.primary },
  presetLabel: { fontSize: 14, fontWeight: '600', color: palette.textMuted },
  presetLabelActive: { color: '#fff' },
  confirm: {
    alignSelf: 'stretch',
    backgroundColor: palette.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skip: { color: palette.textMuted, fontSize: 14, marginTop: 12 },
});
