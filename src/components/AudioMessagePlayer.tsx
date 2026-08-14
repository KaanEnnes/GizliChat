import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Sound, { PlayBackType } from 'react-native-nitro-sound';
import PlaybackWaveform from './PlaybackWaveform';
import { clearAudioPlayerIfActive, setActiveAudioPlayer } from '../services/audioPlaybackRegistry';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  uri: string;
  durationSeconds?: number;
  /** Color of the surrounding bubble's text — used for the duration label. */
  textColor: string;
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Inline play/pause control for a single voice message bubble. */
function AudioMessagePlayer({ uri, durationSeconds, textColor }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // True only while *this* instance owns the shared native player/listener —
  // guards the pause/resume and cleanup paths so one bubble can never touch
  // (and silently kill) another bubble's active playback.
  const isOwnerRef = useRef(false);

  // Stable across re-renders (empty deps — state setters never change) so the
  // shared registry can reliably tell "this exact player" apart from others.
  const resetPlaybackState = useCallback(() => {
    isOwnerRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    setElapsedSeconds(0);
  }, []);

  useEffect(() => {
    return () => {
      // Only stop the native player / remove its listener if this instance
      // is the one actually driving it — otherwise unmounting an off-screen,
      // non-playing bubble (e.g. scrolled out of the FlatList) would kill
      // whichever other bubble is currently playing.
      if (isOwnerRef.current) {
        Sound.stopPlayer().catch(() => undefined);
        Sound.removePlayBackListener();
      }
      clearAudioPlayerIfActive(resetPlaybackState);
    };
  }, [resetPlaybackState]);

  const togglePlayback = async () => {
    if (isPlaying) {
      try {
        await Sound.pausePlayer();
      } catch {
        // fall through — UI still reflects paused below
      }
      setIsPlaying(false);
      setIsPaused(true);
      // Still the owner: the listener stays registered so a resume can pick
      // the same playback position back up instead of restarting from 0.
      return;
    }

    if (isPaused && isOwnerRef.current) {
      try {
        await Sound.resumePlayer();
        setIsPlaying(true);
        setIsPaused(false);
        return;
      } catch {
        // Native resume failed (or something else took over the singleton
        // while we were paused) — fall through to a fresh start below.
      }
    }

    try {
      // react-native-nitro-sound's player is a single app-wide singleton, not
      // one per component — starting playback here without first telling any
      // other currently-"playing"/paused bubble to reset would silently
      // steal its listener, leaving that other bubble's play button stuck.
      setActiveAudioPlayer(resetPlaybackState);
      isOwnerRef.current = true;
      // Defensive: always start from a clean listener state, in case a
      // previous owner's listener is still registered.
      Sound.removePlayBackListener();
      await Sound.startPlayer(uri);
      setIsPlaying(true);
      setIsPaused(false);
      setElapsedSeconds(0);
      Sound.addPlayBackListener((status: PlayBackType) => {
        setElapsedSeconds(status.currentPosition / 1000);
        if (status.currentPosition >= status.duration && status.duration > 0) {
          Sound.stopPlayer().catch(() => undefined);
          Sound.removePlayBackListener();
          isOwnerRef.current = false;
          clearAudioPlayerIfActive(resetPlaybackState);
          setIsPlaying(false);
          setIsPaused(false);
          setElapsedSeconds(0);
        }
      });
    } catch {
      isOwnerRef.current = false;
      clearAudioPlayerIfActive(resetPlaybackState);
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  const displaySeconds = isPlaying || isPaused ? elapsedSeconds : durationSeconds ?? 0;
  const progress =
    (isPlaying || isPaused) && durationSeconds ? Math.min(1, elapsedSeconds / durationSeconds) : 0;

  return (
    <Pressable
      style={styles.row}
      onPress={togglePlayback}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Sesli mesajı duraklat' : 'Sesli mesajı oynat'}>
      <View style={[styles.playButton, { backgroundColor: theme.identity }]}>
        <Text style={[styles.playIcon, { color: theme.identityText }]}>{isPlaying ? '❙❙' : '▶'}</Text>
      </View>
      <View style={styles.waveformColumn}>
        <PlaybackWaveform seed={uri} progress={progress} tint={theme.identity} trackColor={theme.waveformTrack} />
        <Text style={[styles.durationText, { color: textColor }]}>{formatSeconds(displaySeconds)}</Text>
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
    fontSize: 12,
    fontWeight: '700',
  },
  durationText: {
    fontSize: 13,
  },
});

export default AudioMessagePlayer;
