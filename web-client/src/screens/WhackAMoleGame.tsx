import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import GameShell from '../components/GameShell';
import { submitScore } from '../services/leaderboardService';
import { getSavedPlayerName } from '../services/playerNameStorage';

interface Props {
  onBack: () => void;
}

type Phase = 'idle' | 'playing' | 'paused' | 'gameover';

const HOLE_COUNT = 9;
const GAME_DURATION_MS = 30_000;
const BEST_KEY = 'gizlichat_whackamole_best';
const MAX_VISIBLE_MS = 950;
const MIN_VISIBLE_MS = 450;

function WhackAMoleGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);
  const [timeLeftMs, setTimeLeftMs] = useState(GAME_DURATION_MS);
  const [activeHole, setActiveHole] = useState<number | null>(null);

  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const activeHoleRef = useRef<number | null>(null);
  const startTimeRef = useRef(Date.now());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scheduleNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem(BEST_KEY, String(score));
    }
  }, [score, bestScore]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const hideMole = useCallback((index: number) => {
    setActiveHole(prev => (prev === index ? null : prev));
    if (activeHoleRef.current === index) activeHoleRef.current = null;
    scheduleNextRef.current();
  }, []);

  const showMole = useCallback((index: number, visibleMs: number) => {
    activeHoleRef.current = index;
    setActiveHole(index);
    const t = setTimeout(() => {
      if (activeHoleRef.current === index) hideMole(index);
    }, visibleMs);
    timersRef.current.push(t);
  }, [hideMole]);

  scheduleNextRef.current = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    const delay = 250 + Math.random() * 450;
    const t = setTimeout(() => {
      if (phaseRef.current !== 'playing') return;
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const visibleMs = Math.max(MIN_VISIBLE_MS, MAX_VISIBLE_MS - elapsedSec * 15);
      showMole(Math.floor(Math.random() * HOLE_COUNT), visibleMs);
    }, delay);
    timersRef.current.push(t);
  }, [showMole]);

  const endGame = useCallback(() => {
    setPhase('gameover');
    if (scoreRef.current > 0) submitScore(getSavedPlayerName() || 'Oyuncu', scoreRef.current, 'whackAMole').catch(() => undefined);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    activeHoleRef.current = null;
    setActiveHole(null);
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
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
    if (phase === 'playing') scheduleNextRef.current();
  }, [phase]);

  const handleStart = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    activeHoleRef.current = null;
    setActiveHole(null);
    startTimeRef.current = Date.now();
    setScore(0);
    setTimeLeftMs(GAME_DURATION_MS);
    setPhase('playing');
  };

  const handleHoleClick = (index: number) => {
    if (phaseRef.current !== 'playing' || activeHoleRef.current !== index) return;
    setScore(prev => prev + 1);
    hideMole(index);
  };

  const secondsLeft = Math.ceil(timeLeftMs / 1000);

  return (
    <GameShell
      title="KÖSTEBEK VURMA"
      onBack={onBack}
      stats={[{ label: 'SKOR', value: score }, { label: 'SÜRE', value: phase === 'playing' ? secondsLeft : '—' }, { label: 'EN YÜKSEK', value: bestScore }]}
      headerRight={
        (phase === 'playing' || phase === 'paused') && (
          <span onClick={() => setPhase(phase === 'paused' ? 'playing' : 'paused')}>{phase === 'paused' ? '▶' : '⏸'}</span>
        )
      }>
      <div className="mole-grid" style={{ opacity: phase === 'playing' ? 1 : 0.45 }}>
        {Array.from({ length: HOLE_COUNT }).map((_, index) => (
          <div key={index} className="mole-hole" style={{ background: theme.surfaceAlt, borderColor: theme.border }} onClick={() => handleHoleClick(index)}>
            <span className="mole-emoji" style={{ opacity: activeHole === index ? 1 : 0, transform: activeHole === index ? 'scale(1)' : 'scale(0.6)' }}>
              🐹
            </span>
          </div>
        ))}
      </div>

      {phase === 'paused' && (
        <div style={{ marginTop: 26, textAlign: 'center' }}>
          <div className="game-overlay-title" style={{ color: theme.text }}>DURAKLADI</div>
          <button className="game-restart-btn" style={{ background: theme.accent, color: theme.accentText }} onClick={() => setPhase('playing')}>
            DEVAM ET
          </button>
        </div>
      )}

      {(phase === 'idle' || phase === 'gameover') && (
        <div style={{ marginTop: 26, textAlign: 'center', padding: '0 20px' }}>
          {phase === 'gameover' && (
            <>
              <div className="game-overlay-title" style={{ color: theme.text }}>SÜRE BİTTİ</div>
              <div style={{ fontSize: 14, color: theme.textMuted, marginBottom: 16 }}>Skor: {score}</div>
            </>
          )}
          {phase === 'idle' && <div style={{ fontSize: 14, color: theme.textMuted, marginBottom: 16 }}>30 saniyede olabildiğince köstebek yakala!</div>}
          <button className="game-restart-btn" style={{ background: theme.accent, color: theme.accentText }} onClick={handleStart}>
            {phase === 'gameover' ? 'TEKRAR OYNA' : 'BAŞLA'}
          </button>
        </div>
      )}
    </GameShell>
  );
}

export default WhackAMoleGame;
