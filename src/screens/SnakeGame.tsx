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
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { playEatSound, playGameOverSound, playTapSound } from '../services/soundService';
import { vibrateMedium } from '../services/hapticsService';
import { submitScore } from '../services/leaderboardService';
import { getSavedPlayerName } from '../services/playerNameStorage';

interface Props {
  onBack: () => void;
}

interface Position {
  r: number;
  c: number;
}

const GRID = 14;
const MAX_BOARD_SIZE = 440;
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

function angleForDir(dir: { dr: number; dc: number }): number {
  if (dir.dc === 1) return 0;
  if (dir.dr === 1) return 90;
  if (dir.dc === -1) return 180;
  return 270;
}

function SnakeGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  // Scales down on narrow phones (avoids clipping/overflow) and grows with
  // the available height on taller screens instead of sitting at a fixed
  // cap regardless of device size.
  const { width, height } = useWindowDimensions();
  const boardSize = Math.min(width - 40, height - insets.top - insets.bottom - 260, MAX_BOARD_SIZE);
  const innerSize = boardSize - BOARD_PADDING * 2;
  const cellSize = innerSize / GRID;
  const pixelPos = useCallback((pos: Position) => ({ x: pos.c * cellSize, y: pos.r * cellSize }), [cellSize]);

  const [snake, setSnake] = useState<Position[]>(startingSnake);
  // One Animated.ValueXY per snake segment, holding its actual on-screen
  // pixel position — see the tick() comment below for why this replaced a
  // single shared 0→1 progress value.
  const segmentValuesRef = useRef<Animated.ValueXY[]>(
    startingSnake().map(pos => new Animated.ValueXY(pixelPos(pos))),
  );
  const [food, setFood] = useState<Position>(() => pickFoodCell(startingSnake()));
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);

  const snakeRef = useRef(snake);
  snakeRef.current = snake;
  const foodRef = useRef(food);
  foodRef.current = food;
  const directionRef = useRef<{ dr: number; dc: number }>({ dr: 0, dc: 1 });
  const nextDirectionRef = useRef<{ dr: number; dc: number } | null>(null);
  const lastTickMsRef = useRef(INITIAL_TICK_MS);
  // Mirrors `gameOver` but readable/settable synchronously, without waiting
  // for a render — the tick loop below checks this directly so a collision
  // stops scheduling immediately instead of one more tick later.
  const gameOverRef = useRef(false);
  // Mirrors `paused` for the swipe handler below, which is a stable
  // (`useMemo([])`) PanResponder and would otherwise see a stale value.
  const pausedRef = useRef(false);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const foodPulse = useRef(new Animated.Value(1)).current;
  const headAngle = useRef(new Animated.Value(0)).current;
  const headAngleValueRef = useRef(0);

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
    if (gameOverRef.current) {
      return;
    }
    const dir = nextDirectionRef.current ?? directionRef.current;
    directionRef.current = dir;
    nextDirectionRef.current = null;

    const prevSnake = snakeRef.current;
    const head = prevSnake[0];
    const newHead: Position = { r: head.r + dir.dr, c: head.c + dir.dc };

    const hitWall = newHead.r < 0 || newHead.r >= GRID || newHead.c < 0 || newHead.c >= GRID;
    const ateFood = !hitWall && samePos(newHead, foodRef.current);
    // The tail cell vacates this tick unless the snake just ate (in which case
    // the body keeps its tail), so only that cell should be excluded from the
    // self-collision check — otherwise the snake "crashes" into the empty
    // space its own tail is leaving, ending the game far too early.
    const bodyToCheck = ateFood ? prevSnake : prevSnake.slice(0, -1);
    const hitSelf = !hitWall && bodyToCheck.some(seg => samePos(seg, newHead));
    if (hitWall || hitSelf) {
      gameOverRef.current = true;
      setGameOver(true);
      playGameOverSound();
      vibrateMedium();
      const finalScore = prevSnake.length - 3;
      if (finalScore > 0) {
        getSavedPlayerName().then(name => submitScore(name || 'Oyuncu', finalScore, 'snake')).catch(() => undefined);
      }
      return;
    }

    const newSnake = ateFood ? [newHead, ...prevSnake] : [newHead, ...prevSnake.slice(0, -1)];

    const nextTickMs = Math.max(MIN_TICK_MS, INITIAL_TICK_MS - newSnake.length * 4);
    lastTickMsRef.current = nextTickMs;

    const targetAngle = angleForDir(dir);
    const prevAngleMod = ((headAngleValueRef.current % 360) + 360) % 360;
    const angleDiff = (((targetAngle - prevAngleMod + 180) % 360) + 360) % 360 - 180;
    const nextAbsoluteAngle = headAngleValueRef.current + angleDiff;
    headAngleValueRef.current = nextAbsoluteAngle;

    // Each segment gets its own persistent Animated.ValueXY, retargeted (not
    // reset) every tick — Animated.timing always animates from whatever the
    // value currently holds, so there's no snap-back to re-derive here. A
    // single shared 0→1 "progress" value used to drive every segment's
    // interpolated from/to via React state (`segmentsAnim`); resetting that
    // shared value to 0 happened one JS tick *before* React actually
    // committed the new from/to range, so the already-native-driven view
    // would briefly snap back to the previous tick's start cell before
    // jumping forward again once the re-render landed — the visible
    // "titreme" (jitter). Reusing the same instances per index sidesteps the
    // whole race: growth appends one freshly-created value (no old segment
    // to reuse for the new tail cell), everything else just retargets.
    const prevValues = segmentValuesRef.current;
    const nextValues: Animated.ValueXY[] = newSnake.map((pos, i) =>
      i < prevValues.length ? prevValues[i] : new Animated.ValueXY(pixelPos(pos)),
    );
    segmentValuesRef.current = nextValues;
    newSnake.forEach((pos, i) => {
      if (i < prevValues.length) {
        Animated.timing(nextValues[i], {
          toValue: pixelPos(pos),
          duration: nextTickMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }).start();
      }
    });

    setSnake(newSnake);
    Animated.timing(headAngle, {
      toValue: nextAbsoluteAngle,
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
    // headAngle/pixelPos are stable across renders (useRef / cellSize-scoped
    // useCallback) — included for lint completeness, not because they
    // meaningfully change how often this callback is recreated.
  }, [headAngle, pixelPos]);

  // Was a `setTimeout(tick, lastTickMsRef.current)` re-armed inside a
  // useEffect keyed on `snake` (so on every single tick). setTimeout's firing
  // time is never exact — it's delayed by whatever else the JS thread is
  // doing — but each Animated.timing() in tick() was told to last *exactly*
  // that same nominal duration. Any time the timer fired even slightly late,
  // that tick's animation had already finished and sat frozen at its resting
  // cell until the late timer finally caught up — a real glide-stall-glide
  // stutter, not just a debug-build slowdown. A requestAnimationFrame
  // accumulator tracks real elapsed time against `lastTickMsRef.current`
  // (kept live via the ref, still speeding up as the snake grows) and is far
  // steadier than a re-armed setTimeout chain.
  useEffect(() => {
    if (gameOver || paused) {
      return undefined;
    }
    let rafId: number;
    let lastFrameTime = Date.now();
    let accumulatedMs = 0;

    const loop = () => {
      const now = Date.now();
      accumulatedMs += now - lastFrameTime;
      lastFrameTime = now;
      if (accumulatedMs >= lastTickMsRef.current) {
        accumulatedMs -= lastTickMsRef.current;
        tick();
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [gameOver, paused, tick]);

  const togglePause = useCallback(() => {
    playTapSound();
    setPaused(prev => !prev);
  }, []);

  const handleRestart = useCallback(() => {
    playTapSound();
    gameOverRef.current = false;
    const fresh = startingSnake();
    snakeRef.current = fresh;
    directionRef.current = { dr: 0, dc: 1 };
    nextDirectionRef.current = null;
    lastTickMsRef.current = INITIAL_TICK_MS;
    headAngleValueRef.current = 0;
    headAngle.setValue(0);
    segmentValuesRef.current = fresh.map(pos => new Animated.ValueXY(pixelPos(pos)));
    setSnake(fresh);
    const nextFood = pickFoodCell(fresh);
    foodRef.current = nextFood;
    setFood(nextFood);
    setScore(0);
    setGameOver(false);
    setPaused(false);
  }, [headAngle, pixelPos]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gesture) =>
          Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
        onPanResponderRelease: (_evt: GestureResponderEvent, gesture: PanResponderGestureState) => {
          if (pausedRef.current || gameOverRef.current) {
            return;
          }
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

  const cellInset = cellSize * 0.09;

  const checkerCells = useMemo(() => {
    const cells: React.ReactNode[] = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if ((r + c) % 2 === 0) {
          cells.push(
            <View
              key={`bg-${r}-${c}`}
              style={{
                position: 'absolute',
                left: c * cellSize,
                top: r * cellSize,
                width: cellSize,
                height: cellSize,
                backgroundColor: theme.border,
                opacity: 0.16,
              }}
            />,
          );
        }
      }
    }
    return cells;
  }, [cellSize, theme.border]);

  const headRotate = headAngle.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Oyunlara dön">
          <Text style={[styles.menuLink, { color: theme.textMuted }]}>‹ Menü</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>YILAN</Text>
        <Pressable
          onPress={togglePause}
          hitSlop={8}
          disabled={gameOver}
          style={styles.pauseButton}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Devam et' : 'Duraklat'}>
          <Text style={[styles.pauseIcon, { color: gameOver ? theme.textFaint : theme.textMuted }]}>
            {paused ? '▶' : '⏸'}
          </Text>
        </Pressable>
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
          { width: boardSize, height: boardSize, backgroundColor: theme.surfaceAlt, borderColor: theme.border },
        ]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {checkerCells}
        </View>

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
          ]}>
          <View style={styles.foodShine} />
        </Animated.View>

        {snake.map((_pos, i) => {
          const segValue = segmentValuesRef.current[i];
          const isHead = i === 0;
          const taper = Math.max(0.6, 1 - i * 0.025);
          return (
            <Animated.View
              key={`seg-${i}`}
              style={[
                styles.segment,
                {
                  width: cellSize - cellInset * 2,
                  height: cellSize - cellInset * 2,
                  borderRadius: isHead ? cellSize * 0.4 : cellSize * Math.max(0.14, 0.24 - i * 0.01),
                  backgroundColor: isHead ? theme.accent : theme.success,
                  opacity: isHead ? 1 : Math.max(0.55, 1 - i * 0.015),
                  transform: isHead
                    ? [{ translateX: segValue.x }, { translateY: segValue.y }, { rotate: headRotate }]
                    : [{ translateX: segValue.x }, { translateY: segValue.y }, { scale: taper }],
                },
              ]}>
              {isHead && (
                <>
                  <View style={[styles.eye, { top: '20%', left: '56%' }]}>
                    <View style={styles.pupil} />
                  </View>
                  <View style={[styles.eye, { top: '58%', left: '56%' }]}>
                    <View style={styles.pupil} />
                  </View>
                </>
              )}
            </Animated.View>
          );
        })}

        {paused && !gameOver && (
          <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
            <Text style={[styles.overlayTitle, { color: theme.text }]}>DURAKLADI</Text>
            <Pressable
              onPress={togglePause}
              style={[styles.restartButton, { backgroundColor: theme.accent }]}
              accessibilityRole="button"
              accessibilityLabel="Devam et">
              <Text style={[styles.restartButtonText, { color: theme.accentText }]}>DEVAM ET</Text>
            </Pressable>
          </View>
        )}

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
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  pauseButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pauseIcon: {
    fontSize: 20,
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
  foodShine: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    width: '30%',
    height: '30%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  eye: {
    position: 'absolute',
    width: '20%',
    height: '20%',
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: {
    width: '55%',
    height: '55%',
    borderRadius: 999,
    backgroundColor: '#16202b',
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
