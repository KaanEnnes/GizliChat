import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import GameShell from '../components/GameShell';
import { submitScore } from '../services/leaderboardService';
import { getSavedPlayerName } from '../services/playerNameStorage';

interface Props {
  onBack: () => void;
}

type Cell = 'X' | 'O' | null;
type Outcome = 'player' | 'ai' | 'draw' | null;

const BEST_KEY = 'gizlichat_tictactoe_best';
const AI_MOVE_DELAY_MS = 500;

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function emptyBoard(): Cell[] {
  return Array(9).fill(null);
}
function winningLine(board: Cell[], mark: 'X' | 'O'): number[] | null {
  return WIN_LINES.find(line => line.every(i => board[i] === mark)) ?? null;
}

/** Simple heuristic, not full minimax: win if possible, else block, else center, else a corner, else whatever's left. */
function pickAiMove(board: Cell[]): number {
  const empty = board.reduce<number[]>((acc, cell, i) => (cell === null ? [...acc, i] : acc), []);
  for (const i of empty) {
    const copy = [...board];
    copy[i] = 'O';
    if (winningLine(copy, 'O')) return i;
  }
  for (const i of empty) {
    const copy = [...board];
    copy[i] = 'X';
    if (winningLine(copy, 'X')) return i;
  }
  if (board[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter(i => board[i] === null);
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
  return empty[Math.floor(Math.random() * empty.length)];
}

function TicTacToeGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [board, setBoard] = useState<Cell[]>(emptyBoard);
  const [turn, setTurn] = useState<'player' | 'ai'>('player');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(() => parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
  }, []);

  useEffect(() => {
    if (streak > bestStreak) {
      setBestStreak(streak);
      localStorage.setItem(BEST_KEY, String(streak));
    }
  }, [streak, bestStreak]);

  const finishRound = useCallback((finalBoard: Cell[], result: Exclude<Outcome, null>) => {
    setOutcome(result);
    if (result === 'player') {
      setWinLine(winningLine(finalBoard, 'X'));
      setStreak(prev => {
        const next = prev + 1;
        submitScore(getSavedPlayerName() || 'Oyuncu', next, 'ticTacToe').catch(() => undefined);
        return next;
      });
    } else if (result === 'ai') {
      setWinLine(winningLine(finalBoard, 'O'));
      setStreak(0);
    } else {
      setWinLine(null);
      setStreak(0);
    }
  }, []);

  const handleCellClick = useCallback(
    (index: number) => {
      if (outcome || turn !== 'player' || board[index] !== null) return;
      const next = [...board];
      next[index] = 'X';
      setBoard(next);

      if (winningLine(next, 'X')) {
        finishRound(next, 'player');
        return;
      }
      if (next.every(cell => cell !== null)) {
        finishRound(next, 'draw');
        return;
      }

      setTurn('ai');
      aiTimerRef.current = setTimeout(() => {
        const aiIndex = pickAiMove(next);
        const afterAi = [...next];
        afterAi[aiIndex] = 'O';
        setBoard(afterAi);

        if (winningLine(afterAi, 'O')) finishRound(afterAi, 'ai');
        else if (afterAi.every(cell => cell !== null)) finishRound(afterAi, 'draw');
        else setTurn('player');
      }, AI_MOVE_DELAY_MS);
    },
    [board, outcome, turn, finishRound],
  );

  const handleRestart = () => {
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    setBoard(emptyBoard());
    setTurn('player');
    setOutcome(null);
    setWinLine(null);
  };

  const statusText = outcome
    ? outcome === 'player' ? 'Kazandın! 🎉' : outcome === 'ai' ? 'Kaybettin' : 'Berabere'
    : turn === 'player' ? 'Sırası sende (X)' : 'Rakip düşünüyor…';

  return (
    <GameShell
      title="XOX"
      onBack={onBack}
      stats={[{ label: 'SERİ', value: streak }, { label: 'EN YÜKSEK', value: bestStreak }]}
      hint="Sen X'sin, rakip O — 3'ü yan yana getir."
      onRestart={handleRestart}>
      <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, marginBottom: 16, textAlign: 'center' }}>{statusText}</div>
      <div className="xox-board" style={{ borderColor: theme.border }}>
        {[0, 1, 2].map(row => (
          <div key={row} className="xox-row">
            {[0, 1, 2].map(col => {
              const i = row * 3 + col;
              const cell = board[i];
              const isWin = winLine?.includes(i);
              return (
                <div
                  key={i}
                  className="xox-cell"
                  style={{
                    borderColor: theme.border,
                    background: isWin ? `${theme.accent}26` : theme.surface,
                    color: cell === 'X' ? theme.identity : theme.accent,
                    cursor: !outcome && turn === 'player' && !cell ? 'pointer' : 'default',
                  }}
                  onClick={() => handleCellClick(i)}>
                  {cell || ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {outcome && (
        <button className="game-restart-btn" style={{ background: theme.accent, color: theme.accentText, marginTop: 20 }} onClick={handleRestart}>
          TEKRAR OYNA
        </button>
      )}
    </GameShell>
  );
}

export default TicTacToeGame;
