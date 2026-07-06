import { useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { palette } from '@/lib/ui';

const SIZE = 264;
const CENTER = SIZE / 2;
const STEP_MINUTES = 5;
const CLOCK_MINUTES = 12 * 60;

function nowClockMinutes(): number {
  const d = new Date();
  return (d.getHours() % 12) * 60 + d.getMinutes();
}

/**
 * A 12-hour clock face. The doctor drags the blue hand to the time they plan
 * to leave; the grey dot marks "now". Reports the duration (minutes from now,
 * clockwise to the hand) in 5-minute steps.
 */
export function DurationDial({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) => handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY),
    })
  ).current;

  function handleTouch(x: number, y: number) {
    // Angle from 12 o'clock, clockwise.
    const deg = (Math.atan2(x - CENTER, CENTER - y) * 180) / Math.PI;
    const normalized = (deg + 360) % 360;
    const targetClock =
      Math.round(((normalized / 360) * CLOCK_MINUTES) / STEP_MINUTES) * STEP_MINUTES;
    const duration = (targetClock - nowClockMinutes() + CLOCK_MINUTES) % CLOCK_MINUTES;
    onChangeRef.current(Math.max(STEP_MINUTES, duration));
  }

  const nowAngle = (nowClockMinutes() / CLOCK_MINUTES) * 360;
  const handAngle = (((nowClockMinutes() + minutes) % CLOCK_MINUTES) / CLOCK_MINUTES) * 360;

  return (
    <View style={styles.dial} {...panResponder.panHandlers}>
      {/* Hour ticks */}
      {Array.from({ length: 12 }, (_, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[styles.tickWrap, { transform: [{ rotate: `${i * 30}deg` }] }]}>
          <View style={[styles.tick, i % 3 === 0 && styles.tickBold]} />
        </View>
      ))}
      {/* Numerals */}
      <Text pointerEvents="none" style={[styles.numeral, styles.n12]}>12</Text>
      <Text pointerEvents="none" style={[styles.numeral, styles.n3]}>3</Text>
      <Text pointerEvents="none" style={[styles.numeral, styles.n6]}>6</Text>
      <Text pointerEvents="none" style={[styles.numeral, styles.n9]}>9</Text>

      {/* "Now" marker */}
      <View
        pointerEvents="none"
        style={[styles.markerWrap, { transform: [{ rotate: `${nowAngle}deg` }] }]}>
        <View style={styles.nowDot} />
      </View>

      {/* Departure hand */}
      <View
        pointerEvents="none"
        style={[styles.markerWrap, { transform: [{ rotate: `${handAngle}deg` }] }]}>
        <View style={styles.hand} />
        <View style={styles.handKnob} />
      </View>

      <View pointerEvents="none" style={styles.hub} />
    </View>
  );
}

const styles = StyleSheet.create({
  dial: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: palette.background,
    borderWidth: 1,
    borderColor: palette.border,
    alignSelf: 'center',
  },
  tickWrap: { ...StyleSheet.absoluteFill, alignItems: 'center' },
  tick: {
    position: 'absolute',
    top: 10,
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: palette.border,
  },
  tickBold: { backgroundColor: palette.away, height: 14 },
  numeral: {
    position: 'absolute',
    fontSize: 15,
    fontWeight: '600',
    color: palette.textMuted,
  },
  n12: { top: 28, alignSelf: 'center' },
  n3: { right: 28, top: CENTER - 10 },
  n6: { bottom: 28, alignSelf: 'center' },
  n9: { left: 28, top: CENTER - 10 },
  markerWrap: { ...StyleSheet.absoluteFill, alignItems: 'center' },
  nowDot: {
    position: 'absolute',
    top: 30,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.away,
  },
  hand: {
    position: 'absolute',
    top: 46,
    width: 4,
    height: CENTER - 46,
    borderRadius: 2,
    backgroundColor: palette.primary,
  },
  handKnob: {
    position: 'absolute',
    top: 36,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.primary,
    borderWidth: 3,
    borderColor: '#fff',
  },
  hub: {
    position: 'absolute',
    top: CENTER - 7,
    left: CENTER - 7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: palette.primary,
  },
});
