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
import { useTheme } from '../theme/ThemeContext';
import { playGameOverSound, playMergeSound, playTapSound, playWinSound } from '../services/soundService';
import { vibrateMedium } from '../services/hapticsService';

interface Props {
  onBack: () => void;
}

const GRID_SIZE = 4;
const MAX_BOARD_SIZE = 360;
const BOARD_PADDING = 10;
const CELL_GAP = 8;
const SWIPE_THRESHOLD = 24;
const BEST_STORAGE_KEY = 'gizlichat_2048_best';
const MOVE_ANIM_MS = 120;
const WIN_VALUE = 2048;

type Direction = 'up' | 'down' | 'left' | 'right';
type Grid = number[][]; // 0 = empty

interface TileData {
  id: number;
  r: number;
  c: number;
  value: number;
}

interface GhostTileData {
  id: number;
  value: number;
  from: { r: number; c: number };
  to: { r: number; c: number };
}

const TILE_COLORS: Record<number, { bg: string; text: string }> = {
  2: { bg: '#EEE4DA', text: '#5C534A' },
  4: { bg: '#EDE0C8', text: '#5C534A' },
  8: { bg: '#F2B179', text: '#FFF8F0' },
  16: { bg: '#F59563', text: '#FFF8F0' },
  32: { bg: '#F67C5F', text: '#FFF8F0' },
  64: { bg: '#F65E3B', text: '#FFF8F0' },
  128: { bg: '#EDCF72', text: '#FFF8F0' },
  256: { bg: '#EDCC61', text: '#FFF8F0' },
  512: { bg: '#EDC850', text: '#FFF8F0' },
  1024: { bg: '#EDC53F', text: '#FFF8F0' },
  2048: { bg: '#EDC22E', text: '#FFF8F0' },
};
const FALLBACK_TILE = { bg: '#3C3A32', text: '#F5F5F7' };

function emptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

function tilesToGrid(tiles: TileData[]): Grid {
  const grid = emptyGrid();
  tiles.forEach(t => {
    grid[t.r][t.c] = t.value;
  });
  return grid;
}

function emptyCells(grid: Grid): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (grid[r][c] === 0) {
        cells.push([r, c]);
      }
    }
  }
  return cells;
}

function hasAnyMove(grid: Grid): boolean {
  if (emptyCells(grid).length > 0) {
    return true;
  }
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const value = grid[r][c];
      if (c + 1 < GRID_SIZE && grid[r][c + 1] === value) {
        return true;
      }
      if (r + 1 < GRID_SIZE && grid[r + 1][c] === value) {
        return true;
      }
    }
  }
  return false;
}

function pickSpawnCell(tiles: TileData[]): [number, number] | null {
  const cells = emptyCells(tilesToGrid(tiles));
  if (cells.length === 0) {
    return null;
  }
  return cells[Math.floor(Math.random() * cells.length)];
}

/** Appends one random new tile (90% a "2", 10% a "4") to an empty cell, if any remain. */
function spawnRandomTile(
  tiles: TileData[],
  nextId: number,
): { tiles: TileData[]; spawnedId: number | null } {
  const cell = pickSpawnCell(tiles);
  if (!cell) {
    return { tiles, spawnedId: null };
  }
  const [r, c] = cell;
  const value = Math.random() < 0.9 ? 2 : 4;
  return { tiles: [...tiles, { id: nextId, r, c, value }], spawnedId: nextId };
}

function startingTiles(): TileData[] {
  let tiles: TileData[] = [];
  let id = 1;
  for (let i = 0; i < 2; i++) {
    const result = spawnRandomTile(tiles, id);
    tiles = result.tiles;
    if (result.spawnedId !== null) {
      id++;
    }
  }
  return tiles;
}

function slotToCoord(direction: Direction, lineIndex: number, slot: number): [number, number] {
  switch (direction) {
    case 'left':
      return [lineIndex, slot];
    case 'right':
      return [lineIndex, GRID_SIZE - 1 - slot];
    case 'up':
      return [slot, lineIndex];
    case 'down':
    default:
      return [GRID_SIZE - 1 - slot, lineIndex];
  }
}

/**
 * Slides + merges every tile for one gesture. Survivors keep their id (so
 * <TileView> stays mounted and animates its own position/value changes);
 * the tile that gets absorbed into a merge is reported separately in
 * `removed` (its original cell + the merge target) so the caller can render
 * a short-lived "ghost" that visibly slides into the surviving tile before
 * disappearing, instead of just vanishing.
 */
function moveTiles(
  tiles: TileData[],
  direction: Direction,
): { tiles: TileData[]; removed: GhostTileData[]; gained: number; moved: boolean } {
  const survivors: TileData[] = [];
  const removed: GhostTileData[] = [];
  let gained = 0;
  let moved = false;

  const isHorizontal = direction === 'left' || direction === 'right';
  const reversed = direction === 'right' || direction === 'down';

  for (let lineIndex = 0; lineIndex < GRID_SIZE; lineIndex++) {
    let lineTiles = tiles
      .filter(t => (isHorizontal ? t.r === lineIndex : t.c === lineIndex))
      .sort((a, b) => (isHorizontal ? a.c - b.c : a.r - b.r));
    if (reversed) {
      lineTiles = [...lineTiles].reverse();
    }

    let slot = 0;
    let i = 0;
    while (i < lineTiles.length) {
      const cur = lineTiles[i];
      const next = lineTiles[i + 1];
      const [r, c] = slotToCoord(direction, lineIndex, slot);

      if (next && next.value === cur.value) {
        const mergedValue = cur.value * 2;
        gained += mergedValue;
        survivors.push({ id: cur.id, value: mergedValue, r, c });
        removed.push({ id: next.id, value: next.value, from: { r: next.r, c: next.c }, to: { r, c } });
        moved = true;
        slot++;
        i += 2;
      } else {
        if (cur.r !== r || cur.c !== c) {
          moved = true;
        }
        survivors.push({ id: cur.id, value: cur.value, r, c });
        slot++;
        i += 1;
      }
    }
  }

  return { tiles: survivors, removed, gained, moved };
}

function tilePixelOffset(r: number, c: number, cellSize: number): { x: number; y: number } {
  return { x: c * (cellSize + CELL_GAP), y: r * (cellSize + CELL_GAP) };
}

function TileView({ tile, cellSize }: { tile: TileData; cellSize: number }): React.JSX.Element {
  const translate = useRef(new Animated.ValueXY(tilePixelOffset(tile.r, tile.c, cellSize))).current;
  const scale = useRef(new Animated.Value(0)).current;
  const prevValueRef = useRef(tile.value);

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 6, tension: 140, useNativeDriver: true }).start();
    // Mount-only: every fresh tile (including the two the board starts with) pops in once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Animated.timing(translate, {
      toValue: tilePixelOffset(tile.r, tile.c, cellSize),
      duration: MOVE_ANIM_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [tile.r, tile.c, cellSize, translate]);

  useEffect(() => {
    if (prevValueRef.current !== tile.value) {
      prevValueRef.current = tile.value;
      scale.setValue(1.2);
      Animated.spring(scale, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }).start();
    }
  }, [tile.value, scale]);

  const tileColor = TILE_COLORS[tile.value] ?? FALLBACK_TILE;

  return (
    <Animated.View
      style={[
        styles.tile,
        {
          width: cellSize,
          height: cellSize,
          backgroundColor: tileColor.bg,
          transform: [...translate.getTranslateTransform(), { scale }],
        },
      ]}>
      <Text style={[styles.tileText, { color: tileColor.text, fontSize: tile.value >= 1024 ? 20 : 24 }]}>
        {tile.value}
      </Text>
    </Animated.View>
  );
}

function GhostTileView({ ghost, cellSize }: { ghost: GhostTileData; cellSize: number }): React.JSX.Element {
  const translate = useRef(new Animated.ValueXY(tilePixelOffset(ghost.from.r, ghost.from.c, cellSize))).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(translate, {
      toValue: tilePixelOffset(ghost.to.r, ghost.to.c, cellSize),
      duration: MOVE_ANIM_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    Animated.timing(opacity, {
      toValue: 0,
      duration: MOVE_ANIM_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tileColor = TILE_COLORS[ghost.value] ?? FALLBACK_TILE;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tile,
        {
          width: cellSize,
          height: cellSize,
          backgroundColor: tileColor.bg,
          opacity,
          transform: translate.getTranslateTransform(),
        },
      ]}>
      <Text style={[styles.tileText, { color: tileColor.text, fontSize: ghost.value >= 1024 ? 20 : 24 }]}>
        {ghost.value}
      </Text>
    </Animated.View>
  );
}

function Game2048({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 40, MAX_BOARD_SIZE);
  const [tiles, setTiles] = useState<TileData[]>(startingTiles);
  const [ghosts, setGhosts] = useState<GhostTileData[]>([]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [showWinBanner, setShowWinBanner] = useState(false);

  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;
  const nextIdRef = useRef(tiles.length);
  const animatingRef = useRef(false);
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasWonRef = useRef(false);

  const boardPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AsyncStorage.getItem(BEST_STORAGE_KEY).then(saved => {
      if (saved) {
        setBestScore(parseInt(saved, 10) || 0);
      }
    });
    return () => {
      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      AsyncStorage.setItem(BEST_STORAGE_KEY, String(score)).catch(() => undefined);
    }
  }, [score, bestScore]);

  const triggerPulse = useCallback(() => {
    boardPulse.setValue(1);
    Animated.sequence([
      Animated.timing(boardPulse, { toValue: 1.015, duration: 70, useNativeDriver: true }),
      Animated.timing(boardPulse, { toValue: 1, duration: 110, useNativeDriver: true }),
    ]).start();
  }, [boardPulse]);

  const handleSwipe = useCallback(
    (direction: Direction) => {
      if (gameOver || animatingRef.current) {
        return;
      }
      const result = moveTiles(tilesRef.current, direction);
      if (!result.moved) {
        return;
      }

      animatingRef.current = true;
      setTiles(result.tiles);
      setGhosts(result.removed);

      if (result.gained > 0) {
        setScore(prev => prev + result.gained);
        playMergeSound();
        triggerPulse();
      }

      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current);
      }
      moveTimerRef.current = setTimeout(() => {
        setGhosts([]);
        nextIdRef.current += 1;
        const spawned = spawnRandomTile(tilesRef.current, nextIdRef.current);
        setTiles(spawned.tiles);

        if (!hasWonRef.current && spawned.tiles.some(t => t.value >= WIN_VALUE)) {
          hasWonRef.current = true;
          playWinSound();
          setShowWinBanner(true);
          setTimeout(() => setShowWinBanner(false), 1600);
        }

        if (!hasAnyMove(tilesToGrid(spawned.tiles))) {
          setGameOver(true);
          playGameOverSound();
          vibrateMedium();
        }
        animatingRef.current = false;
        moveTimerRef.current = null;
      }, MOVE_ANIM_MS);
    },
    [gameOver, triggerPulse],
  );

  const handleRestart = useCallback(() => {
    playTapSound();
    if (moveTimerRef.current) {
      clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    animatingRef.current = false;
    hasWonRef.current = false;
    const fresh = startingTiles();
    nextIdRef.current = fresh.length;
    setTiles(fresh);
    setGhosts([]);
    setScore(0);
    setGameOver(false);
    setShowWinBanner(false);
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
          if (Math.abs(dx) > Math.abs(dy)) {
            handleSwipe(dx > 0 ? 'right' : 'left');
          } else {
            handleSwipe(dy > 0 ? 'down' : 'up');
          }
        },
      }),
    [handleSwipe],
  );

  const innerSize = boardSize - BOARD_PADDING * 2;
  const cellSize = (innerSize - CELL_GAP * (GRID_SIZE - 1)) / GRID_SIZE;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Oyunlara dön">
          <Text style={[styles.menuLink, { color: theme.textMuted }]}>‹ Menü</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>2048</Text>
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

      {showWinBanner && (
        <View style={[styles.winBanner, { backgroundColor: theme.accent }]}>
          <Text style={[styles.winBannerText, { color: theme.accentText }]}>🎉 2048'e ulaştın!</Text>
        </View>
      )}

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.board,
          {
            width: boardSize,
            height: boardSize,
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
            transform: [{ scale: boardPulse }],
          },
        ]}>
        {Array.from({ length: GRID_SIZE }).map((_, r) =>
          Array.from({ length: GRID_SIZE }).map((__, c) => (
            <View
              key={`bg-${r}:${c}`}
              style={[
                styles.cellBackground,
                {
                  left: c * (cellSize + CELL_GAP),
                  top: r * (cellSize + CELL_GAP),
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: theme.background,
                },
              ]}
            />
          )),
        )}

        {tiles.map(tile => (
          <TileView key={tile.id} tile={tile} cellSize={cellSize} />
        ))}
        {ghosts.map(ghost => (
          <GhostTileView key={`ghost-${ghost.id}`} ghost={ghost} cellSize={cellSize} />
        ))}

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
      </Animated.View>

      <Text style={[styles.hint, { color: theme.textFaint }]}>
        Kayarak birleştir, aynı sayıları çarpıştır!
      </Text>

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
    marginBottom: 12,
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
  winBanner: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  winBannerText: {
    fontSize: 13,
    fontWeight: '800',
  },
  board: {
    borderRadius: 16,
    borderWidth: 1,
    padding: BOARD_PADDING,
  },
  cellBackground: {
    position: 'absolute',
    borderRadius: 8,
  },
  tile: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: {
    fontWeight: '800',
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

export default Game2048;
