import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
  /** Normalized mic input level, 0 (silence) – 1 (loud). */
  level: number;
  color: string;
}

const BAR_COUNT = 24;
const MIN_BAR_HEIGHT = 4;
const MAX_BAR_HEIGHT = 28;

/** Live WhatsApp-style scrolling level meter, shown while recording a voice message. */
function RecordingWaveform({ level, color }: Props): React.JSX.Element {
  const [bars, setBars] = useState<number[]>(() => new Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    const interval = setInterval(() => {
      const height = MIN_BAR_HEIGHT + levelRef.current * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT);
      setBars(previous => [...previous.slice(1), height]);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.row}>
      {bars.map((height, index) => (
        <View key={index} style={[styles.bar, { height, backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: MAX_BAR_HEIGHT,
    paddingHorizontal: 14,
  },
  bar: {
    width: 3,
    marginHorizontal: 1.5,
    borderRadius: 2,
  },
});

export default RecordingWaveform;
