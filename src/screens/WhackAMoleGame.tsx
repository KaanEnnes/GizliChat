import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { playGameOverSound, playHitSound, playMissSound, playTapSound } from '../services/soundService';
import { vibrateMedium } from '../services/hapticsService';

interface Props {
  onBack: () => void;
}

type Phase = 'idle' | 'playing' | 'paused' | 'gameover';

const HOLE_COUNT = 9;
const GAME_DURATION_MS = 30_000;
const BEST_STORAGE_KEY = 'gizlichat_whackamole_best';
const MAX_VISIBLE_MS = 950;
const MIN_VISIBLE_MS = 450;
const MAX_GRID_SIZE = 380;

function WhackAMoleGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const gridSize = Math.min(width - 40, height - insets.top - insets.bottom - 280, MAX_GRID_SIZE);
  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(GAME_DURATION_MS);

  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const activeHoleRef = useRef<number | null>(null);
  const startTimeRef = useRef(Date.now());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const holeAnims = useRef(Array.from({ length: HOLE_COUNT }, () => new Animated.Value(0))).current;

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

  const hideMole = useCallback(
    (index: number, wasHit: boolean) => {
      Animated.timing(holeAnims[index], {
        toValue: 0,
        duration: wasHit ? 90 : 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
      if (!wasHit) {
        playMissSound();
      }
      if (activeHoleRef.current === index) {
        activeHoleRef.current = null;
      }
      scheduleNextMoleRef.current();
    },
    [holeAnims],
  );

  const showMole = useCallback(
    (index: number, visibleMs: number) => {
      activeHoleRef.current = index;
      holeAnims[index].setValue(0);
      Animated.spring(holeAnims[index], { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
      const timer = setTimeout(() => {
        if (activeHoleRef.current === index) {
          hideMole(index, false);
        }
      }, visibleMs);
      timersRef.current.push(timer);
    },
    [hideMole, holeAnims],
  );

  const scheduleNextMoleRef = useRef<() => void>(() => {});
  scheduleNextMoleRef.current = useCallback(() => {
    if (phaseRef.current !== 'playing') {
      return;
    }
    const delay = 250 + Math.random() * 450;
    const timer = setTimeout(() => {
      if (phaseRef.current !== 'playing') {
        return;
      }
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const visibleMs = Math.max(MIN_VISIBLE_MS, MAX_VISIBLE_MS - elapsedSec * 15);
      const nextHole = Math.floor(Math.random() * HOLE_COUNT);
      showMole(nextHole, visibleMs);
    }, delay);
    timersRef.current.push(timer);
  }, [showMole]);

  const endGame = useCallback(() => {
    setPhase('gameover');
    playGameOverSound();
    vibrateMedium();
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (activeHoleRef.current !== null) {
      holeAnims[activeHoleRef.current].setValue(0);
      activeHoleRef.current = null;
    }
  }, [holeAnims]);

  useEffect(() => {
    if (phase !== 'playing') {
      return undefined;
    }
    const id = setInterval(() => {
      setTimeLeftMs(prev => {
        const next = prev - 200;
        if (next <= 0) {
          clearInterval(id);
          endGame();
          return 0;
        }
        return next;
      });
    }, 200);
    return () => clearInterval(id);
  }, [phase, endGame]);

  useEffect(() => {
    if (phase === 'playing') {
      scheduleNextMoleRef.current();
    }
  }, [phase]);

  const pauseGame = useCallback(() => {
    playTapSound();
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (activeHoleRef.current !== null) {
      holeAnims[activeHoleRef.current].setValue(0);
      activeHoleRef.current = null;
    }
    setPhase('paused');
  }, [holeAnims]);

  const resumeGame = useCallback(() => {
    playTapSound();
    setPhase('playing');
  }, []);

  const handleStart = useCallback(() => {
    playTapSound();
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    holeAnims.forEach(anim => anim.setValue(0));
    activeHoleRef.current = null;
    startTimeRef.current = Date.now();
    setScore(0);
    setTimeLeftMs(GAME_DURATION_MS);
    setPhase('playing');
  }, [holeAnims]);

  const handleHolePress = useCallback(
    (index: number) => {
      if (phaseRef.current !== 'playing' || activeHoleRef.current !== index) {
        return;
      }
      playHitSound();
      setScore(prev => prev + 1);
      hideMole(index, true);
    },
    [hideMole],
  );

  const secondsLeft = Math.ceil(timeLeftMs / 1000);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Oyunlara dön">
          <Text style={[styles.menuLink, { color: theme.textMuted }]}>‹ Menü</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>KÖSTEBEK VURMA</Text>
        {phase === 'playing' || phase === 'paused' ? (
          <Pressable
            onPress={phase === 'paused' ? resumeGame : pauseGame}
            hitSlop={8}
            style={styles.pauseButton}
            accessibilityRole="button"
            accessibilityLabel={phase === 'paused' ? 'Devam et' : 'Duraklat'}>
            <Text style={[styles.pauseIcon, { color: theme.textMuted }]}>{phase === 'paused' ? '▶' : '⏸'}</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>SKOR</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{score}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>SÜRE</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{phase === 'playing' ? secondsLeft : '—'}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>EN YÜKSEK</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{bestScore}</Text>
        </View>
      </View>

      <View style={[styles.grid, { width: gridSize, opacity: phase === 'playing' ? 1 : 0.45 }]}>
        {Array.from({ length: HOLE_COUNT }).map((_, index) => {
          const translateY = holeAnims[index].interpolate({ inputRange: [0, 1], outputRange: [30, 0] });
          const opacity = holeAnims[index];
          const scale = holeAnims[index].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
          return (
            <Pressable
              key={index}
              onPress={() => handleHolePress(index)}
              style={styles.holeWrap}
              accessibilityRole="button"
              accessibilityLabel={`Delik ${index + 1}`}>
              <View style={[styles.hole, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                <Animated.View
                  pointerEvents="none"
                  style={[styles.mole, { opacity, transform: [{ translateY }, { scale }] }]}>
                  <Text style={styles.moleEmoji}>🐹</Text>
                </Animated.View>
              </View>
            </Pressable>
          );
        })}
      </View>

      {phase === 'paused' && (
        <View style={styles.overlayArea}>
          <Text style={[styles.overlayTitle, { color: theme.text }]}>DURAKLADI</Text>
          <Pressable
            onPress={resumeGame}
            style={[styles.startButton, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Devam et">
            <Text style={[styles.startButtonText, { color: theme.accentText }]}>DEVAM ET</Text>
          </Pressable>
        </View>
      )}

      {(phase === 'idle' || phase === 'gameover') && (
        <View style={styles.overlayArea}>
          {phase === 'gameover' && (
            <>
              <Text style={[styles.overlayTitle, { color: theme.text }]}>SÜRE BİTTİ</Text>
              <Text style={[styles.overlayScore, { color: theme.textMuted }]}>Skor: {score}</Text>
            </>
          )}
          {phase === 'idle' && (
            <Text style={[styles.overlayScore, { color: theme.textMuted }]}>
              30 saniyede olabildiğince köstebek yakala!
            </Text>
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
    justifyContent: 'center',
    paddingHorizontal: 20,
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSpacer: {
    width: 40,
  },
  pauseButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pauseIcon: {
    fontSize: 18,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 340,
    justifyContent: 'space-between',
    marginBottom: 18,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  holeWrap: {
    width: '31%',
    aspectRatio: 1,
    marginBottom: 12,
  },
  hole: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mole: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  moleEmoji: {
    fontSize: 34,
  },
  overlayArea: {
    marginTop: 26,
    alignItems: 'center',
    paddingHorizontal: 20,
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
    textAlign: 'center',
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

export default WhackAMoleGame;
