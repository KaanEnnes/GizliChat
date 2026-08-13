import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sound, { PlayBackType } from 'react-native-nitro-sound';
import PlaybackWaveform from './PlaybackWaveform';
import { clearAudioPlayerIfActive, setActiveAudioPlayer } from '../services/audioPlaybackRegistry';

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

  // Stable across re-renders (empty deps — state setters never change) so the
  // shared registry can reliably tell "this exact player" apart from others.
  const resetPlaybackState = useCallback(() => {
    setIsPlaying(false);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    return () => {
      Sound.stopPlayer().catch(() => undefined);
      Sound.removePlayBackListener();
      clearAudioPlayerIfActive(resetPlaybackState);
    };
  }, [resetPlaybackState]);

  const togglePlayback = async () => {
    if (isPlaying) {
      await Sound.pausePlayer();
      setIsPlaying(false);
      clearAudioPlayerIfActive(resetPlaybackState);
      return;
    }

    try {
      // react-native-nitro-sound's player is a single app-wide singleton, not
      // one per component — starting playback here without first telling any
      // other currently-"playing" bubble to reset would silently steal its
      // listener, leaving that other bubble's play button stuck forever.
      setActiveAudioPlayer(resetPlaybackState);
      await Sound.startPlayer(uri);
      setIsPlaying(true);
      Sound.addPlayBackListener((status: PlayBackType) => {
        setElapsedSeconds(status.currentPosition / 1000);
        if (status.currentPosition >= status.duration && status.duration > 0) {
          Sound.stopPlayer().catch(() => undefined);
          Sound.removePlayBackListener();
          clearAudioPlayerIfActive(resetPlaybackState);
          setIsPlaying(false);
          setElapsedSeconds(0);
        }
      });
    } catch {
      setIsPlaying(false);
      clearAudioPlayerIfActive(resetPlaybackState);
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
