import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

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

  const until = new Date(Date.now() + minutes * 60_000);

  // The wheel picks a wall-clock departure time; interpret it as the next
  // occurrence of that time (a pick "earlier than now" wraps to tomorrow).
  function onPickerChange(_event: DateTimePickerEvent, date?: Date) {
    if (!date) return;
    const now = new Date();
    const picked = new Date(now);
    picked.setHours(date.getHours(), date.getMinutes(), 0, 0);
    let diff = Math.round((picked.getTime() - now.getTime()) / 60_000);
    if (diff <= 0) diff += 24 * 60;
    setMinutes(diff);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>I’ll be at {locationName} until…</Text>

        <DateTimePicker
          value={until}
          mode="time"
          display="spinner"
          minuteInterval={5}
          onChange={onPickerChange}
          style={styles.picker}
        />

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
          <Text style={styles.confirmLabel}>
            Set — leaving around {formatTime(until.toISOString())}
          </Text>
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
  title: { fontSize: 19, fontWeight: '700', color: palette.text, textAlign: 'center' },
  picker: { alignSelf: 'stretch', height: 190 },
  duration: { fontSize: 15, fontWeight: '600', color: palette.textMuted },
  presets: { flexDirection: 'row', gap: 8, marginTop: 10 },
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
    marginTop: 14,
  },
  confirmLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skip: { color: palette.textMuted, fontSize: 14, marginTop: 12 },
});
