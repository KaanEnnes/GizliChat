import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

interface Props {
  /** Used to derive stable, per-message bar heights (same message → same shape every render). */
  seed: string;
  /** 0 (not started) – 1 (finished). Bars up to this fraction render in `tint`. */
  progress: number;
  tint: string;
  /** Color for the not-yet-played portion of the bars. */
  trackColor: string;
}

const BAR_COUNT = 28;
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = 22;

/** Deterministic pseudo-random bar heights from a string, so a given voice message always looks the same. */
function barHeightsFromSeed(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(hash, 31) + seed.charCodeAt(i);
  }
  const heights: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    hash = Math.imul(hash, 1103515245) + 12345;
    const unit = (Math.abs(hash) % 1000) / 1000;
    heights.push(MIN_BAR_HEIGHT + unit * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT));
  }
  return heights;
}

/** Static WhatsApp-style waveform for a voice message bubble, with a fill showing playback progress. */
function PlaybackWaveform({ seed, progress, tint, trackColor }: Props): React.JSX.Element {
  const heights = useMemo(() => barHeightsFromSeed(seed), [seed]);
  const filledBars = Math.round(Math.min(1, Math.max(0, progress)) * BAR_COUNT);

  return (
    <View style={styles.row}>
      {heights.map((height, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            { height, backgroundColor: index < filledBars ? tint : trackColor },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: MAX_BAR_HEIGHT,
  },
  bar: {
    width: 2.5,
    marginHorizontal: 1,
    borderRadius: 2,
  },
});

export default PlaybackWaveform;
