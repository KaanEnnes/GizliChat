import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sound, { PlayBackType } from 'react-native-nitro-sound';
import PlaybackWaveform from './PlaybackWaveform';

interface Props {
  uri: string;
  durationSeconds?: number;
  tint: string;
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Inline play/pause control for a single voice message bubble. */
function AudioMessagePlayer({ uri, durationSeconds, tint }: Props): React.JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    return () => {
      Sound.stopPlayer().catch(() => undefined);
      Sound.removePlayBackListener();
    };
  }, []);

  const togglePlayback = async () => {
    if (isPlaying) {
      await Sound.pausePlayer();
      setIsPlaying(false);
      return;
    }

    try {
      await Sound.startPlayer(uri);
      setIsPlaying(true);
      Sound.addPlayBackListener((status: PlayBackType) => {
        setElapsedSeconds(status.currentPosition / 1000);
        if (status.currentPosition >= status.duration && status.duration > 0) {
          Sound.stopPlayer().catch(() => undefined);
          Sound.removePlayBackListener();
          setIsPlaying(false);
          setElapsedSeconds(0);
        }
      });
    } catch {
      setIsPlaying(false);
    }
  };

  const displaySeconds = isPlaying ? elapsedSeconds : durationSeconds ?? 0;
  const progress =
    isPlaying && durationSeconds ? Math.min(1, elapsedSeconds / durationSeconds) : 0;

  return (
    <Pressable style={styles.row} onPress={togglePlayback}>
      <View style={[styles.playButton, { backgroundColor: tint }]}>
        <Text style={styles.playIcon}>{isPlaying ? '❙❙' : '▶'}</Text>
      </View>
      <View style={styles.waveformColumn}>
        <PlaybackWaveform seed={uri} progress={progress} tint={tint} />
        <Text style={styles.durationText}>{formatSeconds(displaySeconds)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 190,
  },
  waveformColumn: {
    flex: 1,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  playIcon: {
    color: '#0F1115',
    fontSize: 12,
    fontWeight: '700',
  },
  durationText: {
    color: '#F5F5F7',
    fontSize: 13,
  },
});

export default AudioMessagePlayer;
