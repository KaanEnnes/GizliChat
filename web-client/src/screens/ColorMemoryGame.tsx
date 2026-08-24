import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import GameShell from '../components/GameShell';
import { submitScore } from '../services/leaderboardService';
import { getSavedPlayerName } from '../services/playerNameStorage';

interface Props {
  onBack: () => void;
}

type Phase = 'idle' | 'showing' | 'input' | 'gameover';

const PAD_COLORS = ['#FF6B6B', '#4D96FF', '#FFE066', '#6BCB77'];
const BEST_KEY = 'gizlichat_colormemory_best';
const BASE_STEP_MS = 520;
const MIN_STEP_MS = 260;
const STEP_SHRINK_PER_ROUND = 14;

function ColorMemoryGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [phase, setPhase] = useState<Phase>('idle');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);
  const [flashIndex, setFlashIndex] = useState<number | null>(null);

  const sequenceRef = useRef<number[]>([]);
  const userIndexRef = useRef(0);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem(BEST_KEY, String(score));
    }
  }, [score, bestScore]);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const flashPad = useCallback((index: number, duration: number) => {
    setFlashIndex(index);
    const t = setTimeout(() => setFlashIndex(null), duration);
    timersRef.current.push(t);
  }, []);

  const playSequence = useCallback(
    (seq: number[]) => {
      setPhase('showing');
      const stepMs = Math.max(MIN_STEP_MS, BASE_STEP_MS - seq.length * STEP_SHRINK_PER_ROUND);
      seq.forEach((padIndex, i) => {
        const t = setTimeout(() => flashPad(padIndex, stepMs * 0.55), i * stepMs);
        timersRef.current.push(t);
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
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    sequenceRef.current = [];
    userIndexRef.current = 0;
    setScore(0);
    const t = setTimeout(() => addRound(), 300);
    timersRef.current.push(t);
  }, [addRound]);

  const handlePadClick = useCallback(
    (index: number) => {
      if (phaseRef.current !== 'input') return;
      flashPad(index, 160);
      const seq = sequenceRef.current;
      const expected = seq[userIndexRef.current];
      if (index !== expected) {
        setPhase('gameover');
        const finalScore = seq.length - 1;
        if (finalScore > 0) submitScore(getSavedPlayerName() || 'Oyuncu', finalScore, 'colorMemory').catch(() => undefined);
        return;
      }
      userIndexRef.current += 1;
      if (userIndexRef.current === seq.length) {
        setScore(seq.length);
        setPhase('showing');
        const t = setTimeout(() => addRound(), 550);
        timersRef.current.push(t);
      }
    },
    [addRound, flashPad],
  );

  const statusText =
    phase === 'idle' ? 'Diziyi izle, sonra aynısını tekrarla.'
    : phase === 'showing' ? 'İzle…'
    : phase === 'input' ? 'Sırası sende!'
    : 'Oyun bitti';

  return (
    <GameShell title="RENK HAFIZASI" onBack={onBack} stats={[{ label: 'TUR', value: score }, { label: 'EN YÜKSEK', value: bestScore }]}>
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, marginBottom: 18, textAlign: 'center' }}>{statusText}</div>
      <div className="pad-grid" style={{ opacity: phase === 'idle' || phase === 'gameover' ? 0.45 : 1 }}>
        {PAD_COLORS.map((color, index) => (
          <button
            key={index}
            className={`color-pad ${flashIndex === index ? 'flash' : ''}`}
            style={{ background: color }}
            disabled={phase !== 'input'}
            onClick={() => handlePadClick(index)}
          />
        ))}
      </div>
      {(phase === 'idle' || phase === 'gameover') && (
        <div style={{ marginTop: 26, textAlign: 'center' }}>
          {phase === 'gameover' && (
            <>
              <div className="game-overlay-title" style={{ color: theme.text }}>OYUN BİTTİ</div>
              <div style={{ fontSize: 14, color: theme.textMuted, marginBottom: 16 }}>Tur: {score}</div>
            </>
          )}
          <button className="game-restart-btn" style={{ background: theme.accent, color: theme.accentText }} onClick={handleStart}>
            {phase === 'gameover' ? 'TEKRAR OYNA' : 'BAŞLA'}
          </button>
        </div>
      )}
    </GameShell>
  );
}

export default ColorMemoryGame;
