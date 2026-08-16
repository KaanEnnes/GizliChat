import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { playGameOverSound, playTapSound, playWinSound } from '../services/soundService';
import { vibrateMedium } from '../services/hapticsService';

interface Props {
  onBack: () => void;
}

type Cell = 'X' | 'O' | null;
type Outcome = 'player' | 'ai' | 'draw' | null;

const BEST_STORAGE_KEY = 'gizlichat_tictactoe_best';
const MAX_BOARD_SIZE = 360;
const AI_MOVE_DELAY_MS = 500;

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
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
    if (winningLine(copy, 'O')) {
      return i;
    }
  }
  for (const i of empty) {
    const copy = [...board];
    copy[i] = 'X';
    if (winningLine(copy, 'X')) {
      return i;
    }
  }
  if (board[4] === null) {
    return 4;
  }
  const corners = [0, 2, 6, 8].filter(i => board[i] === null);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }
  return empty[Math.floor(Math.random() * empty.length)];
}

function TicTacToeGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 40, MAX_BOARD_SIZE);
  const cellSize = (boardSize - 8) / 3;

  const [board, setBoard] = useState<Cell[]>(emptyBoard);
  const [turn, setTurn] = useState<'player' | 'ai'>('player');
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [winLine, setWinLine] = useState<number[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(BEST_STORAGE_KEY).then(saved => {
      if (saved) {
        setBestStreak(parseInt(saved, 10) || 0);
      }
    });
    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (streak > bestStreak) {
      setBestStreak(streak);
      AsyncStorage.setItem(BEST_STORAGE_KEY, String(streak)).catch(() => undefined);
    }
  }, [streak, bestStreak]);

  const finishRound = useCallback((finalBoard: Cell[], result: Exclude<Outcome, null>) => {
    setOutcome(result);
    if (result === 'player') {
      setWinLine(winningLine(finalBoard, 'X'));
      playWinSound();
      setStreak(prev => prev + 1);
    } else if (result === 'ai') {
      setWinLine(winningLine(finalBoard, 'O'));
      playGameOverSound();
      vibrateMedium();
      setStreak(0);
    } else {
      setWinLine(null);
      setStreak(0);
    }
  }, []);

  const handleCellPress = useCallback(
    (index: number) => {
      if (outcome || turn !== 'player' || board[index] !== null) {
        return;
      }
      playTapSound();
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

        if (winningLine(afterAi, 'O')) {
          finishRound(afterAi, 'ai');
        } else if (afterAi.every(cell => cell !== null)) {
          finishRound(afterAi, 'draw');
        } else {
          setTurn('player');
        }
      }, AI_MOVE_DELAY_MS);
    },
    [board, outcome, turn, finishRound],
  );

  const handleRestart = useCallback(() => {
    playTapSound();
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
    }
    setBoard(emptyBoard());
    setTurn('player');
    setOutcome(null);
    setWinLine(null);
  }, []);

  const statusText = outcome
    ? outcome === 'player'
      ? 'Kazandın! 🎉'
      : outcome === 'ai'
      ? 'Kaybettin'
      : 'Berabere'
    : turn === 'player'
    ? 'Sırası sende (X)'
    : 'Rakip düşünüyor…';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Oyunlara dön">
          <Text style={[styles.menuLink, { color: theme.textMuted }]}>‹ Menü</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>XOX</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>SERİ</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{streak}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textFaint }]}>EN YÜKSEK</Text>
          <Text style={[styles.statValue, { color: theme.text }]}>{bestStreak}</Text>
        </View>
      </View>

      <Text style={[styles.status, { color: theme.textMuted }]}>{statusText}</Text>

      <View
        style={[
          styles.board,
          { width: boardSize, height: boardSize, backgroundColor: theme.surfaceAlt, borderColor: theme.border },
        ]}>
        {[0, 1, 2].map(row => (
          // Explicit rows instead of a single flexWrap list: cellSize*3 lands
          // exactly on the container's inner width with zero slack, and a
          // wrapping layout that tight is one sub-pixel rounding error away
          // from the 3rd cell of every row spilling onto a 4th line instead
          // of staying put — fixed rows can't misfire that way.
          <View key={row} style={styles.boardRow}>
            {[0, 1, 2].map(col => {
              const i = row * 3 + col;
              const cell = board[i];
              const onWinLine = winLine?.includes(i) ?? false;
              return (
                <Pressable
                  key={i}
                  onPress={() => handleCellPress(i)}
                  disabled={!!outcome || turn !== 'player' || cell !== null}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: onWinLine ? `${theme.accent}26` : theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Hücre ${i + 1}${cell ? `, ${cell}` : ''}`}>
                  {cell && (
                    <Text style={[styles.cellText, { color: cell === 'X' ? theme.identity : theme.accent }]}>
                      {cell}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {outcome && (
        <Pressable
          onPress={handleRestart}
          style={[styles.restartButton, { backgroundColor: theme.accent }]}
          accessibilityRole="button"
          accessibilityLabel="Tekrar oyna">
          <Text style={[styles.restartButtonText, { color: theme.accentText }]}>TEKRAR OYNA</Text>
        </Pressable>
      )}

      <Text style={[styles.hint, { color: theme.textFaint }]}>Sen X'sin, rakip O — 3'ü yan yana getir.</Text>
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
  board: {
    flexDirection: 'column',
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    overflow: 'hidden',
  },
  boardRow: {
    flexDirection: 'row',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cellText: {
    fontSize: 40,
    fontWeight: '800',
  },
  restartButton: {
    marginTop: 22,
    borderRadius: 14,
    paddingHorizontal: 30,
    paddingVertical: 14,
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
});

export default TicTacToeGame;
