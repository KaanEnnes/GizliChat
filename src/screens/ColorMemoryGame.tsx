import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { playGameOverSound, playNoteSound, playTapSound, playWrongSound } from '../services/soundService';
import { vibrateMedium } from '../services/hapticsService';

interface Props {
  onBack: () => void;
}

type Phase = 'idle' | 'showing' | 'input' | 'gameover';

const PAD_COLORS = ['#FF6B6B', '#4D96FF', '#FFE066', '#6BCB77'];
const BEST_STORAGE_KEY = 'gizlichat_colormemory_best';
const BASE_STEP_MS = 520;
const MIN_STEP_MS = 260;
const STEP_SHRINK_PER_ROUND = 14;

function ColorMemoryGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);

  const sequenceRef = useRef<number[]>([]);
  const userIndexRef = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const padAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    AsyncStorage.getItem(BEST_STORAGE_KEY).then(saved => {
      if (saved) {
        setBestScore(parseInt(saved, 10) || 0);
      }
    });
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      AsyncStorage.setItem(BEST_STORAGE_KEY, String(score)).catch(() => undefined);
    }
  }, [score, bestScore]);

  const flashPad = useCallback(
    (index: number, duration: number) => {
      padAnims[index].setValue(1);
      Animated.timing(padAnims[index], {
        toValue: 0,
        duration,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    },
    [padAnims],
  );

  const playSequence = useCallback(
    (seq: number[]) => {
      setPhase('showing');
      const stepMs = Math.max(MIN_STEP_MS, BASE_STEP_MS - seq.length * STEP_SHRINK_PER_ROUND);
      seq.forEach((padIndex, i) => {
        const timer = setTimeout(() => {
          flashPad(padIndex, stepMs * 0.55);
          playNoteSound(padIndex);
        }, i * stepMs);
        timersRef.current.push(timer);
      });
      const endTimer = setTimeout(() => {
        userIndexRef.current = 0;
        setPhase('input');
      }, seq.length * stepMs + 150);
      timersRef.current.push(endTimer);
    },
    [flashPad],
  );

  const addRound = useCallback(() => {
    const nextPad = Math.floor(Math.random() * 4);
    const next = [...sequenceRef.current, nextPad];
    sequenceRef.current = next;
    playSequence(next);
  }, [playSequence]);

  const handleStart = useCallback(() => {
    playTapSound();
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    sequenceRef.current = [];
    userIndexRef.current = 0;
    setScore(0);
    const timer = setTimeout(() => addRound(), 300);
    timersRef.current.push(timer);
  }, [addRound]);

  const handlePadPress = useCallback(
    (index: number) => {
      if (phaseRef.current !== 'input') {
        return;
      }
      flashPad(index, 160);
      playNoteSound(index);

      const seq = sequenceRef.current;
      const expected = seq[userIndexRef.current];
      if (index !== expected) {
        playWrongSound();
        setPhase('gameover');
        playGameOverSound();
        vibrateMedium();
        return;
      }

      userIndexRef.current += 1;
      if (userIndexRef.current === seq.length) {
        setScore(seq.length);
        setPhase('showing');
        const timer = setTimeout(() => addRound(), 550);
        timersRef.current.push(timer);
      }
    },
    [addRound, flashPad],
  );

  const statusText =
    phase === 'idle'
      ? 'Diziyi izle, sonra aynısını tekrarla.'
      : phase === 'showing'
      ? 'İzle…'
      : phase === 'input'
      ? 'Sırası sende!'
      : 'Oyun bitti';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Oyunlara dön">
          <Text style={[styles.menuLink, { color: theme.textMuted }]}>‹ Menü</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>RENK HAFIZASI</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>TUR</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{score}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>EN YÜKSEK</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{bestScore}</Text>
        </View>
      </View>

      <Text style={[styles.status, { color: theme.textMuted }]}>{statusText}</Text>

      <View style={[styles.padGrid, { opacity: phase === 'idle' || phase === 'gameover' ? 0.45 : 1 }]}>
        {PAD_COLORS.map((color, index) => {
          const glowOpacity = padAnims[index].interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] });
          const scale = padAnims[index].interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
          return (
            <Pressable
              key={index}
              onPress={() => handlePadPress(index)}
              disabled={phase !== 'input'}
              style={styles.padWrap}
              accessibilityRole="button"
              accessibilityLabel={`Pad ${index + 1}`}>
              <Animated.View style={[styles.pad, { backgroundColor: color, transform: [{ scale }] }]}>
                <Animated.View style={[styles.padGlow, { opacity: glowOpacity }]} />
              </Animated.View>
            </Pressable>
          );
        })}
      </View>

      {(phase === 'idle' || phase === 'gameover') && (
        <View style={styles.overlayArea}>
          {phase === 'gameover' && (
            <>
              <Text style={[styles.overlayTitle, { color: theme.text }]}>OYUN BİTTİ</Text>
              <Text style={[styles.overlayScore, { color: theme.textMuted }]}>Tur: {score}</Text>
            </>
          )}
          <Pressable
            onPress={handleStart}
            style={[styles.startButton, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel={phase === 'gameover' ? 'Tekrar oyna' : 'Başla'}>
            <Text style={[styles.startButtonText, { color: theme.accentText }]}>
              {phase === 'gameover' ? 'TEKRAR OYNA' : 'BAŞLA'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  menuLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerSpacer: {
    width: 40,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 320,
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 18,
    textAlign: 'center',
  },
  padGrid: {
    width: 280,
    height: 280,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  padWrap: {
    width: '48%',
    height: '48%',
  },
  pad: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  padGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
  },
  overlayArea: {
    marginTop: 26,
    alignItems: 'center',
  },
  overlayTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  overlayScore: {
    fontSize: 14,
    marginBottom: 16,
  },
  startButton: {
    borderRadius: 14,
    paddingHorizontal: 30,
    paddingVertical: 14,
  },
  startButtonText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default ColorMemoryGame;
