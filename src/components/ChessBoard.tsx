import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Chess } from '../services/chessService';

interface Props {
  fen: string;
  /** Which side this device plays — null while spectating/waiting (board is shown but not interactive). */
  myColor: 'w' | 'b' | null;
  isMyTurn: boolean;
  onMove: (from: string, to: string) => void;
  size: number;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PIECE_GLYPHS: Record<string, string> = {
  wk: '♔',
  wq: '♕',
  wr: '♖',
  wb: '♗',
  wn: '♘',
  wp: '♙',
  bk: '♚',
  bq: '♛',
  br: '♜',
  bb: '♝',
  bn: '♞',
  bp: '♟',
};

/**
 * Reusable 8x8 board shared by the two chess entry points (ChatRoomScreen's
 * direct-with-a-contact game and Mini Oyunlar's room-code game) — both just
 * hand it a FEN string and a move callback, see chessService.ts.
 */
function ChessBoard({ fen, myColor, isMyTurn, onMove, size }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const board = useMemo(() => chess.board(), [chess]);
  const inCheck = chess.inCheck();

  const legalTargets = useMemo(() => {
    if (!selected) {
      return new Set<string>();
    }
    return new Set(chess.moves({ square: selected as never, verbose: true }).map(m => m.to));
  }, [chess, selected]);

  const cellSize = size / 8;
  // Flip the board for black so each player always sees their own pieces
  // along the bottom — ranks/files are walked in reverse for that side.
  const ranks = myColor === 'b' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = myColor === 'b' ? [...FILES].reverse() : FILES;

  const handleSquarePress = (square: string) => {
    if (!isMyTurn || !myColor) {
      return;
    }
    if (selected && legalTargets.has(square)) {
      onMove(selected, square);
      setSelected(null);
      return;
    }
    const piece = chess.get(square as never);
    if (piece && piece.color === myColor) {
      setSelected(square);
    } else {
      setSelected(null);
    }
  };

  const coordSize = Math.max(14, cellSize * 0.24);

  return (
    <View
      style={[
        styles.wrap,
        { shadowColor: theme.mode === 'dark' ? '#000' : '#1E293B' },
      ]}>
      <View
        style={[
          styles.board,
          {
            width: size,
            height: size,
            borderColor: theme.border,
            backgroundColor: theme.surface,
          },
        ]}>
        {ranks.map(rank => (
          <View key={rank} style={styles.row}>
            {files.map(file => {
              const square = `${file}${rank}`;
              const rankIndex = 8 - rank;
              const fileIndex = FILES.indexOf(file);
              const piece = board[rankIndex]?.[fileIndex];
              const isDark = (rankIndex + fileIndex) % 2 === 1;
              const isSelected = selected === square;
              const isTarget = legalTargets.has(square);
              const isKingInCheck = inCheck && piece?.type === 'k' && piece.color === chess.turn();
              const isFirstFile = file === files[0];
              const isLastRank = rank === ranks[ranks.length - 1];

              return (
                <Pressable
                  key={square}
                  onPress={() => handleSquarePress(square)}
                  style={[
                    styles.square,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: isSelected
                        ? `${theme.identity}55`
                        : isKingInCheck
                        ? `${theme.danger}55`
                        : isDark
                        ? theme.surfaceAlt
                        : theme.surface,
                    },
                  ]}>
                  {piece && (
                    <Text
                      style={[
                        styles.pieceText,
                        {
                          fontSize: cellSize * 0.68,
                          textShadowColor:
                            theme.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.25)',
                        },
                      ]}>
                      {PIECE_GLYPHS[`${piece.color}${piece.type}`]}
                    </Text>
                  )}
                  {isTarget && !piece && (
                    <View style={[styles.moveDot, { backgroundColor: `${theme.identity}88` }]} />
                  )}
                  {isTarget && piece && (
                    <View style={[styles.captureRing, { borderColor: `${theme.danger}aa` }]} />
                  )}
                  {isFirstFile && (
                    <Text
                      style={[
                        styles.rankLabel,
                        { fontSize: coordSize, color: isDark ? theme.surface : theme.surfaceAlt },
                      ]}>
                      {rank}
                    </Text>
                  )}
                  {isLastRank && (
                    <Text
                      style={[
                        styles.fileLabel,
                        { fontSize: coordSize, color: isDark ? theme.surface : theme.surfaceAlt },
                      ]}>
                      {file}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  board: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  square: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieceText: {
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  moveDot: {
    position: 'absolute',
    width: '28%',
    height: '28%',
    borderRadius: 999,
  },
  captureRing: {
    position: 'absolute',
    width: '86%',
    height: '86%',
    borderRadius: 999,
    borderWidth: 2.5,
  },
  rankLabel: {
    position: 'absolute',
    top: 2,
    left: 3,
    fontWeight: '700',
    opacity: 0.75,
  },
  fileLabel: {
    position: 'absolute',
    bottom: 1,
    right: 3,
    fontWeight: '700',
    opacity: 0.75,
  },
});

export default ChessBoard;
