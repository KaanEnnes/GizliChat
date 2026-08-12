import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { playEatSound, playGameOverSound, playTapSound } from '../services/soundService';
import { vibrateMedium } from '../services/hapticsService';

interface Props {
  onBack: () => void;
}

interface Position {
  r: number;
  c: number;
}

interface SegmentAnim {
  from: Position;
  to: Position;
}

const GRID = 14;
const BOARD_SIZE = 320;
const BOARD_PADDING = 6;
const SWIPE_THRESHOLD = 18;
const INITIAL_TICK_MS = 220;
const MIN_TICK_MS = 95;
const BEST_STORAGE_KEY = 'gizlichat_snake_best';

function startingSnake(): Position[] {
  const midR = Math.floor(GRID / 2);
  const midC = Math.floor(GRID / 2);
  return [
    { r: midR, c: midC },
    { r: midR, c: midC - 1 },
    { r: midR, c: midC - 2 },
  ];
}

function pickFoodCell(snake: Position[]): Position {
  const occupied = new Set(snake.map(p => `${p.r}:${p.c}`));
  const free: Position[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!occupied.has(`${r}:${c}`)) {
        free.push({ r, c });
      }
    }
  }
  if (free.length === 0) {
    return { r: 0, c: 0 };
  }
  return free[Math.floor(Math.random() * free.length)];
}

function samePos(a: Position, b: Position): boolean {
  return a.r === b.r && a.c === b.c;
}

function SnakeGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [snake, setSnake] = useState<Position[]>(startingSnake);
  const [segmentsAnim, setSegmentsAnim] = useState<SegmentAnim[]>(() =>
    startingSnake().map(pos => ({ from: pos, to: pos })),
  );
  const [food, setFood] = useState<Position>(() => pickFoodCell(startingSnake()));
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const snakeRef = useRef(snake);
  snakeRef.current = snake;
  const foodRef = useRef(food);
  foodRef.current = food;
  const directionRef = useRef<{ dr: number; dc: number }>({ dr: 0, dc: 1 });
  const nextDirectionRef = useRef<{ dr: number; dc: number } | null>(null);
  const lastTickMsRef = useRef(INITIAL_TICK_MS);

  const progress = useRef(new Animated.Value(0)).current;
  const foodPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(BEST_STORAGE_KEY).then(saved => {
      if (saved) {
        setBestScore(parseInt(saved, 10) || 0);
      }
    });
  }, []);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      AsyncStorage.setItem(BEST_STORAGE_KEY, String(score)).catch(() => undefined);
    }
  }, [score, bestScore]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(foodPulse, { toValue: 1.15, duration: 420, useNativeDriver: true }),
        Animated.timing(foodPulse, { toValue: 0.9, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [foodPulse]);

  const tick = useCallback(() => {
    const dir = nextDirectionRef.current ?? directionRef.current;
    directionRef.current = dir;
    nextDirectionRef.current = null;

    const prevSnake = snakeRef.current;
    const head = prevSnake[0];
    const newHead: Position = { r: head.r + dir.dr, c: head.c + dir.dc };

    const hitWall = newHead.r < 0 || newHead.r >= GRID || newHead.c < 0 || newHead.c >= GRID;
    const hitSelf = prevSnake.some(seg => samePos(seg, newHead));
    if (hitWall || hitSelf) {
      setGameOver(true);
      playGameOverSound();
      vibrateMedium();
      return;
    }

    const ateFood = samePos(newHead, foodRef.current);
    const newSnake = ateFood ? [newHead, ...prevSnake] : [newHead, ...prevSnake.slice(0, -1)];
    const anim: SegmentAnim[] = newSnake.map((pos, i) => ({
      from: i < prevSnake.length ? prevSnake[i] : pos,
      to: pos,
    }));

    const nextTickMs = Math.max(MIN_TICK_MS, INITIAL_TICK_MS - newSnake.length * 4);
    lastTickMsRef.current = nextTickMs;

    setSegmentsAnim(anim);
    setSnake(newSnake);
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: nextTickMs,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

    if (ateFood) {
      playEatSound();
      setScore(prev => prev + 1);
      const nextFood = pickFoodCell(newSnake);
      foodRef.current = nextFood;
      setFood(nextFood);
    }
  }, [progress]);

  useEffect(() => {
    if (gameOver) {
      return undefined;
    }
    const id = setTimeout(tick, lastTickMsRef.current);
    return () => clearTimeout(id);
  }, [snake, gameOver, tick]);

  const handleRestart = useCallback(() => {
    playTapSound();
    const fresh = startingSnake();
    snakeRef.current = fresh;
    directionRef.current = { dr: 0, dc: 1 };
    nextDirectionRef.current = null;
    lastTickMsRef.current = INITIAL_TICK_MS;
    setSnake(fresh);
    setSegmentsAnim(fresh.map(pos => ({ from: pos, to: pos })));
    const nextFood = pickFoodCell(fresh);
    foodRef.current = nextFood;
    setFood(nextFood);
    setScore(0);
    setGameOver(false);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
        onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          const { dx, dy } = gesture;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) {
            return;
          }
          const candidate =
            Math.abs(dx) > Math.abs(dy)
              ? { dr: 0, dc: dx > 0 ? 1 : -1 }
              : { dr: dy > 0 ? 1 : -1, dc: 0 };
          const cur = directionRef.current;
          // Ignore a direct 180° reversal — it would run the snake straight into itself.
          if (candidate.dr === -cur.dr && candidate.dc === -cur.dc) {
            return;
          }
          nextDirectionRef.current = candidate;
        },
      }),
    [],
  );

  const innerSize = BOARD_SIZE - BOARD_PADDING * 2;
  const cellSize = innerSize / GRID;
  const cellInset = cellSize * 0.09;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Oyunlara dön">
          <Text style={[styles.menuLink, { color: theme.textMuted }]}>‹ Menü</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>YILAN</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>SKOR</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{score}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>EN YÜKSEK</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{bestScore}</Text>
        </View>
      </View>

      <View
        {...panResponder.panHandlers}
        style={[
          styles.board,
          { width: BOARD_SIZE, height: BOARD_SIZE, backgroundColor: theme.surfaceAlt, borderColor: theme.border },
        ]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.food,
            {
              width: cellSize - cellInset * 2,
              height: cellSize - cellInset * 2,
              left: food.c * cellSize + cellInset,
              top: food.r * cellSize + cellInset,
              backgroundColor: theme.danger,
              transform: [{ scale: foodPulse }],
            },
          ]}
        />

        {segmentsAnim.map((seg, i) => {
          const tx = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [seg.from.c * cellSize, seg.to.c * cellSize],
          });
          const ty = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [seg.from.r * cellSize, seg.to.r * cellSize],
          });
          const isHead = i === 0;
          return (
            <Animated.View
              key={`seg-${i}`}
              style={[
                styles.segment,
                {
                  width: cellSize - cellInset * 2,
                  height: cellSize - cellInset * 2,
                  borderRadius: isHead ? cellSize * 0.35 : cellSize * 0.22,
                  backgroundColor: isHead ? theme.accent : theme.success,
                  opacity: isHead ? 1 : Math.max(0.55, 1 - i * 0.015),
                  transform: [{ translateX: tx }, { translateY: ty }],
                },
              ]}
            />
          );
        })}

        {gameOver && (
          <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
            <Text style={[styles.overlayTitle, { color: theme.text }]}>OYUN BİTTİ</Text>
            <Pressable
              onPress={handleRestart}
              style={[styles.restartButton, { backgroundColor: theme.accent }]}
              accessibilityRole="button"
              accessibilityLabel="Tekrar oyna">
              <Text style={[styles.restartButtonText, { color: theme.accentText }]}>TEKRAR OYNA</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Text style={[styles.hint, { color: theme.textFaint }]}>Kaydırarak yönü değiştir, elmaları topla!</Text>

      <Pressable
        onPress={handleRestart}
        hitSlop={8}
        style={styles.secondaryButton}
        accessibilityRole="button"
        accessibilityLabel="Yeni oyun">
        <Text style={[styles.secondaryButtonText, { color: theme.textMuted }]}>Yeni Oyun</Text>
      </Pressable>
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
    fontSize: 20,
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
    marginBottom: 16,
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
  board: {
    borderRadius: 16,
    borderWidth: 1,
    padding: BOARD_PADDING,
    overflow: 'hidden',
  },
  segment: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  food: {
    position: 'absolute',
    borderRadius: 999,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  restartButton: {
    borderRadius: 14,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  restartButtonText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 14,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default SnakeGame;
