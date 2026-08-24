import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import GameShell from '../components/GameShell';
import { submitScore } from '../services/leaderboardService';
import { getSavedPlayerName } from '../services/playerNameStorage';

interface Props {
  onBack: () => void;
}

const GRID_SIZE = 4;
const BEST_KEY = 'gizlichat_2048_best';
const WIN_VALUE = 2048;

type Direction = 'up' | 'down' | 'left' | 'right';

interface TileData {
  id: number;
  r: number;
  c: number;
  value: number;
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

function emptyGrid(): number[][] {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}
function tilesToGrid(tiles: TileData[]): number[][] {
  const grid = emptyGrid();
  tiles.forEach(t => (grid[t.r][t.c] = t.value));
  return grid;
}
function emptyCells(grid: number[][]): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (grid[r][c] === 0) cells.push([r, c]);
  return cells;
}
function hasAnyMove(grid: number[][]): boolean {
  if (emptyCells(grid).length > 0) return true;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const v = grid[r][c];
      if (c + 1 < GRID_SIZE && grid[r][c + 1] === v) return true;
      if (r + 1 < GRID_SIZE && grid[r + 1][c] === v) return true;
    }
  }
  return false;
}
function spawnRandomTile(tiles: TileData[], nextId: number): { tiles: TileData[]; spawnedId: number | null } {
  const cells = emptyCells(tilesToGrid(tiles));
  if (cells.length === 0) return { tiles, spawnedId: null };
  const [r, c] = cells[Math.floor(Math.random() * cells.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  return { tiles: [...tiles, { id: nextId, r, c, value }], spawnedId: nextId };
}
function startingTiles(): TileData[] {
  let tiles: TileData[] = [];
  let id = 1;
  for (let i = 0; i < 2; i++) {
    const res = spawnRandomTile(tiles, id);
    tiles = res.tiles;
    if (res.spawnedId !== null) id++;
  }
  return tiles;
}
function slotToCoord(direction: Direction, lineIndex: number, slot: number): [number, number] {
  switch (direction) {
    case 'left': return [lineIndex, slot];
    case 'right': return [lineIndex, GRID_SIZE - 1 - slot];
    case 'up': return [slot, lineIndex];
    default: return [GRID_SIZE - 1 - slot, lineIndex];
  }
}
function moveTiles(tiles: TileData[], direction: Direction): { tiles: TileData[]; gained: number; moved: boolean } {
  const survivors: TileData[] = [];
  let gained = 0;
  let moved = false;
  const isHorizontal = direction === 'left' || direction === 'right';
  const reversed = direction === 'right' || direction === 'down';

  for (let lineIndex = 0; lineIndex < GRID_SIZE; lineIndex++) {
    let lineTiles = tiles
      .filter(t => (isHorizontal ? t.r === lineIndex : t.c === lineIndex))
      .sort((a, b) => (isHorizontal ? a.c - b.c : a.r - b.r));
    if (reversed) lineTiles = [...lineTiles].reverse();

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
        moved = true;
        slot++;
        i += 2;
      } else {
        if (cur.r !== r || cur.c !== c) moved = true;
        survivors.push({ id: cur.id, value: cur.value, r, c });
        slot++;
        i += 1;
      }
    }
  }
  return { tiles: survivors, gained, moved };
}

function Game2048({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [tiles, setTiles] = useState<TileData[]>(startingTiles);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);
  const [gameOver, setGameOver] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const nextIdRef = useRef(tiles.length);
  const hasWonRef = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem(BEST_KEY, String(score));
    }
  }, [score, bestScore]);

  const handleMove = useCallback(
    (direction: Direction) => {
      if (gameOver) return;
      const result = moveTiles(tiles, direction);
      if (!result.moved) return;
      let nextTiles = result.tiles;
      if (result.gained > 0) setScore(prev => prev + result.gained);

      nextIdRef.current += 1;
      const spawned = spawnRandomTile(nextTiles, nextIdRef.current);
      nextTiles = spawned.tiles;
      setTiles(nextTiles);

      if (!hasWonRef.current && nextTiles.some(t => t.value >= WIN_VALUE)) {
        hasWonRef.current = true;
        setShowWin(true);
        setTimeout(() => setShowWin(false), 1600);
      }
      if (!hasAnyMove(tilesToGrid(nextTiles))) {
        setGameOver(true);
        setScore(current => {
          if (current > 0) submitScore(getSavedPlayerName() || 'Oyuncu', current, '2048').catch(() => undefined);
          return current;
        });
      }
    },
    [tiles, gameOver],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handleMove('left');
      else if (e.key === 'ArrowRight') handleMove('right');
      else if (e.key === 'ArrowUp') handleMove('up');
      else if (e.key === 'ArrowDown') handleMove('down');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleMove]);

  const handleRestart = () => {
    const fresh = startingTiles();
    nextIdRef.current = fresh.length;
    hasWonRef.current = false;
    setTiles(fresh);
    setScore(0);
    setGameOver(false);
    setShowWin(false);
  };

  const cellPercent = 100 / GRID_SIZE;

  return (
    <GameShell title="2048" onBack={onBack} stats={[{ label: 'SKOR', value: score }, { label: 'EN YÜKSEK', value: bestScore }]} hint="Ok tuşlarıyla veya kaydırarak birleştir!" onRestart={handleRestart}>
      {showWin && (
        <div style={{ background: theme.accent, color: theme.accentText, borderRadius: 12, padding: '8px 16px', marginBottom: 10, fontSize: 13, fontWeight: 800 }}>
          🎉 2048'e ulaştın!
        </div>
      )}
      <div
        className="game-board-wrap"
        onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          if (!touchStart.current) return;
          const dx = e.changedTouches[0].clientX - touchStart.current.x;
          const dy = e.changedTouches[0].clientY - touchStart.current.y;
          touchStart.current = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
          if (Math.abs(dx) > Math.abs(dy)) handleMove(dx > 0 ? 'right' : 'left');
          else handleMove(dy > 0 ? 'down' : 'up');
        }}>
        <div className="board-2048" style={{ background: theme.surfaceAlt, borderColor: theme.border }}>
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => (
            <div key={i} className="cell-2048-bg" style={{ background: theme.background }} />
          ))}
          {tiles.map(tile => {
            const tileColor = TILE_COLORS[tile.value] ?? FALLBACK_TILE;
            return (
              <div
                key={tile.id}
                className="tile-2048"
                style={{
                  left: `calc(${tile.c * cellPercent}% + ${tile.c * 2}px)`,
                  top: `calc(${tile.r * cellPercent}% + ${tile.r * 2}px)`,
                  width: `calc(${cellPercent}% - 6px)`,
                  height: `calc(${cellPercent}% - 6px)`,
                  background: tileColor.bg,
                  color: tileColor.text,
                  fontSize: tile.value >= 1024 ? 18 : 22,
                }}>
                {tile.value}
              </div>
            );
          })}
          {gameOver && (
            <div className="game-overlay" style={{ background: theme.overlay }}>
              <div className="game-overlay-title" style={{ color: theme.text }}>OYUN BİTTİ</div>
              <button className="game-restart-btn" style={{ background: theme.accent, color: theme.accentText }} onClick={handleRestart}>
                TEKRAR OYNA
              </button>
            </div>
          )}
        </div>
      </div>
    </GameShell>
  );
}

export default Game2048;
