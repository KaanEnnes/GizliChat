import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import GameShell from '../components/GameShell';
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
const INITIAL_TICK_MS = 220;
const MIN_TICK_MS = 95;
const BEST_KEY = 'gizlichat_snake_best';

function startingSnake(): Position[] {
  const mid = Math.floor(GRID / 2);
  return [{ r: mid, c: mid }, { r: mid, c: mid - 1 }, { r: mid, c: mid - 2 }];
}
function pickFoodCell(snake: Position[]): Position {
  const occupied = new Set(snake.map(p => `${p.r}:${p.c}`));
  const free: Position[] = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) if (!occupied.has(`${r}:${c}`)) free.push({ r, c });
  return free.length ? free[Math.floor(Math.random() * free.length)] : { r: 0, c: 0 };
}
function samePos(a: Position, b: Position): boolean {
  return a.r === b.r && a.c === b.c;
}

function SnakeGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [snake, setSnake] = useState<Position[]>(startingSnake);
  const [food, setFood] = useState<Position>(() => pickFoodCell(startingSnake()));
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);

  const snakeRef = useRef(snake);
  snakeRef.current = snake;
  const foodRef = useRef(food);
  foodRef.current = food;
  const directionRef = useRef<{ dr: number; dc: number }>({ dr: 0, dc: 1 });
  const nextDirectionRef = useRef<{ dr: number; dc: number } | null>(null);
  const tickMsRef = useRef(INITIAL_TICK_MS);
  const gameOverRef = useRef(false);
  const pausedRef = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem(BEST_KEY, String(score));
    }
  }, [score, bestScore]);

  const tick = useCallback(() => {
    if (gameOverRef.current) return;
    const dir = nextDirectionRef.current ?? directionRef.current;
    directionRef.current = dir;
    nextDirectionRef.current = null;

    const prevSnake = snakeRef.current;
    const head = prevSnake[0];
    const newHead: Position = { r: head.r + dir.dr, c: head.c + dir.dc };
    const hitWall = newHead.r < 0 || newHead.r >= GRID || newHead.c < 0 || newHead.c >= GRID;
    const ateFood = !hitWall && samePos(newHead, foodRef.current);
    const bodyToCheck = ateFood ? prevSnake : prevSnake.slice(0, -1);
    const hitSelf = !hitWall && bodyToCheck.some(seg => samePos(seg, newHead));

    if (hitWall || hitSelf) {
      gameOverRef.current = true;
      setGameOver(true);
      const finalScore = prevSnake.length - 3;
      if (finalScore > 0) submitScore(getSavedPlayerName() || 'Oyuncu', finalScore, 'snake').catch(() => undefined);
      return;
    }

    const newSnake = ateFood ? [newHead, ...prevSnake] : [newHead, ...prevSnake.slice(0, -1)];
    tickMsRef.current = Math.max(MIN_TICK_MS, INITIAL_TICK_MS - newSnake.length * 4);
    setSnake(newSnake);

    if (ateFood) {
      setScore(prev => prev + 1);
      const nextFood = pickFoodCell(newSnake);
      foodRef.current = nextFood;
      setFood(nextFood);
    }
  }, []);

  useEffect(() => {
    if (gameOver || paused) return;
    const id = setInterval(tick, tickMsRef.current);
    return () => clearInterval(id);
    // Re-armed whenever speed changes (tickMsRef updates trigger via snake.length dependency below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver, paused, tick, snake.length]);

  const handleRestart = () => {
    gameOverRef.current = false;
    const fresh = startingSnake();
    directionRef.current = { dr: 0, dc: 1 };
    nextDirectionRef.current = null;
    tickMsRef.current = INITIAL_TICK_MS;
    setSnake(fresh);
    const nextFood = pickFoodCell(fresh);
    foodRef.current = nextFood;
    setFood(nextFood);
    setScore(0);
    setGameOver(false);
    setPaused(false);
  };

  const applyDirection = (candidate: { dr: number; dc: number }) => {
    if (pausedRef.current || gameOverRef.current) return;
    const cur = directionRef.current;
    if (candidate.dr === -cur.dr && candidate.dc === -cur.dc) return;
    nextDirectionRef.current = candidate;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') applyDirection({ dr: 0, dc: -1 });
      else if (e.key === 'ArrowRight') applyDirection({ dr: 0, dc: 1 });
      else if (e.key === 'ArrowUp') applyDirection({ dr: -1, dc: 0 });
      else if (e.key === 'ArrowDown') applyDirection({ dr: 1, dc: 0 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const cellSizePercent = 100 / GRID;

  return (
    <GameShell
      title="YILAN"
      onBack={onBack}
      stats={[{ label: 'SKOR', value: score }, { label: 'EN YÜKSEK', value: bestScore }]}
      hint="Ok tuşlarıyla/kaydırarak yön değiştir, elmaları topla!"
      onRestart={handleRestart}
      headerRight={
        !gameOver && (
          <span onClick={() => setPaused(p => !p)}>{paused ? '▶' : '⏸'}</span>
        )
      }>
      <div
        className="game-board-wrap"
        onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          if (!touchStart.current) return;
          const dx = e.changedTouches[0].clientX - touchStart.current.x;
          const dy = e.changedTouches[0].clientY - touchStart.current.y;
          touchStart.current = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
          if (Math.abs(dx) > Math.abs(dy)) applyDirection({ dr: 0, dc: dx > 0 ? 1 : -1 });
          else applyDirection({ dr: dy > 0 ? 1 : -1, dc: 0 });
        }}>
        <div className="board-snake" style={{ background: theme.surfaceAlt, borderColor: theme.border }}>
          <div
            className="snake-food"
            style={{
              left: `${food.c * cellSizePercent}%`, top: `${food.r * cellSizePercent}%`,
              width: `${cellSizePercent}%`, height: `${cellSizePercent}%`, background: theme.danger,
            }}
          />
          {snake.map((seg, i) => (
            <div
              key={i}
              className="snake-segment"
              style={{
                left: `${seg.c * cellSizePercent}%`, top: `${seg.r * cellSizePercent}%`,
                width: `${cellSizePercent}%`, height: `${cellSizePercent}%`,
                background: i === 0 ? theme.accent : theme.success,
                opacity: i === 0 ? 1 : Math.max(0.55, 1 - i * 0.02),
                borderRadius: i === 0 ? '40%' : '20%',
              }}
            />
          ))}
          {paused && !gameOver && (
            <div className="game-overlay" style={{ background: theme.overlay }}>
              <div className="game-overlay-title" style={{ color: theme.text }}>DURAKLADI</div>
              <button className="game-restart-btn" style={{ background: theme.accent, color: theme.accentText }} onClick={() => setPaused(false)}>
                DEVAM ET
              </button>
            </div>
          )}
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

export default SnakeGame;
