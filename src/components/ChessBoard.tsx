import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Chess } from '../services/chessService';
import ChessPieceIcon, { shadeColor } from './chessPieceIcons';

interface SquareRef {
  from: string;
  to: string;
}

interface Props {
  fen: string;
  /** Which side this device plays — null while spectating/waiting (board is shown but not interactive). */
  myColor: 'w' | 'b' | null;
  isMyTurn: boolean;
  onMove: (from: string, to: string) => void;
  size: number;
  /** Most recent move by either side, highlighted like chess.com's yellow from/to squares. */
  lastMove?: SquareRef | null;
  /** Lets the player queue a move while it's not their turn (e.g. bot is thinking); executed by the caller once it becomes their turn. */
  allowPremove?: boolean;
  premove?: SquareRef | null;
  onSetPremove?: (from: string, to: string) => void;
  onClearPremove?: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const SELECTED_OVERLAY = 'rgba(246,246,105,0.85)';
const LAST_MOVE_OVERLAY = 'rgba(246,246,105,0.5)';
const PREMOVE_OVERLAY = 'rgba(235,97,80,0.55)';
const CHECK_OVERLAY = 'rgba(235,97,80,0.85)';
const LEGAL_DOT = 'rgba(20,20,20,0.22)';
const CAPTURE_RING = 'rgba(20,20,20,0.35)';

interface AnimPiece {
  uid: string;
  type: string;
  color: string;
  square: string;
  anim: Animated.ValueXY;
  opacity: Animated.Value;
}

function boardToList(board: ReturnType<InstanceType<typeof Chess>['board']>): { type: string; color: string; square: string }[] {
  const list: { type: string; color: string; square: string }[] = [];
  board.forEach((row, r) => {
    row.forEach((piece, f) => {
      if (piece) {
        list.push({ type: piece.type, color: piece.color, square: `${FILES[f]}${8 - r}` });
      }
    });
  });
  return list;
}

/**
 * Reusable 8x8 board shared by the chess entry points (ChatRoomScreen's
 * direct-with-a-contact game, Mini Oyunlar's room-code game, and the
 * vs-computer game) — all hand it a FEN string and a move callback, see
 * chessService.ts / chessBotService.ts.
 */
function ChessBoard({
  fen,
  myColor,
  isMyTurn,
  onMove,
  size,
  lastMove,
  allowPremove,
  premove,
  onSetPremove,
  onClearPremove,
}: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);

  // Board tint derives from the app's own blue identity color instead of a
  // fixed chess.com-style green/cream, so the board matches whichever theme
  // (light/dark) is active — pieces then use blue vs. orange (accent) to
  // tell the two sides apart, per the app's own color language.
  const darkSquare = theme.identity;
  const lightSquare = shadeColor(theme.identity, theme.mode === 'dark' ? 0.62 : 0.58);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const board = useMemo(() => chess.board(), [chess]);
  const inCheck = chess.inCheck();

  const legalTargets = useMemo(() => {
    if (!selected || !isMyTurn) {
      return new Set<string>();
    }
    return new Set(chess.moves({ square: selected as never, verbose: true }).map(m => m.to));
  }, [chess, selected, isMyTurn]);

  const cellSize = size / 8;
  // Flip the board for black so each player always sees their own pieces
  // along the bottom — ranks/files are walked in reverse for that side.
  const ranks = myColor === 'b' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = myColor === 'b' ? [...FILES].reverse() : FILES;

  const squareToXY = (square: string) => {
    const fileIdx = files.indexOf(square[0]);
    const rankIdx = ranks.indexOf(Number(square[1]));
    return { x: fileIdx * cellSize, y: rankIdx * cellSize };
  };

  // ---- Piece layer with slide/fade animation, decoupled from the square grid ----
  const piecesRef = useRef<AnimPiece[]>([]);
  const uidCounter = useRef(0);
  const [renderPieces, setRenderPieces] = useState<AnimPiece[]>([]);

  useEffect(() => {
    const newList = boardToList(board);
    const prev = piecesRef.current;
    const usedPrev = new Set<number>();
    const matched: (AnimPiece | null)[] = new Array(newList.length).fill(null);

    newList.forEach((n, ni) => {
      const idx = prev.findIndex((p, pi) => !usedPrev.has(pi) && p.square === n.square && p.type === n.type && p.color === n.color);
      if (idx !== -1) {
        usedPrev.add(idx);
        matched[ni] = prev[idx];
      }
    });
    newList.forEach((n, ni) => {
      if (matched[ni]) {
        return;
      }
      const idx = prev.findIndex((p, pi) => !usedPrev.has(pi) && p.type === n.type && p.color === n.color);
      if (idx !== -1) {
        usedPrev.add(idx);
        matched[ni] = prev[idx];
      }
    });

    const newAnimList: AnimPiece[] = newList.map((n, ni) => {
      const target = squareToXY(n.square);
      const entry = matched[ni];
      if (entry) {
        entry.square = n.square;
        Animated.timing(entry.anim, {
          toValue: target,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
        return entry;
      }
      const anim = new Animated.ValueXY(target);
      const opacity = new Animated.Value(0);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      uidCounter.current += 1;
      return { uid: `p${uidCounter.current}`, type: n.type, color: n.color, square: n.square, anim, opacity };
    });

    const captured = prev.filter((_, pi) => !usedPrev.has(pi));
    captured.forEach(c => {
      Animated.timing(c.opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    });

    piecesRef.current = newAnimList;
    setRenderPieces([...newAnimList, ...captured]);
    if (captured.length) {
      const t = setTimeout(() => {
        setRenderPieces(cur => cur.filter(p => newAnimList.includes(p)));
      }, 200);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, myColor]);

  const handleSquarePress = (square: string) => {
    if (!myColor) {
      return;
    }
    if (!isMyTurn) {
      if (!allowPremove || !onSetPremove) {
        return;
      }
      if (selected && selected !== square) {
        onSetPremove(selected, square);
        setSelected(null);
        return;
      }
      const piece = chess.get(square as never);
      if (piece && piece.color === myColor) {
        setSelected(square);
      } else {
        setSelected(null);
        onClearPremove?.();
      }
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
              const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);
              const isPremove = premove && (premove.from === square || premove.to === square);
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
                      backgroundColor: isDark ? darkSquare : lightSquare,
                    },
                  ]}>
                  {isLastMove && <View style={[StyleSheet.absoluteFill, { backgroundColor: LAST_MOVE_OVERLAY }]} />}
                  {isKingInCheck && <View style={[StyleSheet.absoluteFill, { backgroundColor: CHECK_OVERLAY }]} />}
                  {isPremove && <View style={[StyleSheet.absoluteFill, { backgroundColor: PREMOVE_OVERLAY }]} />}
                  {isSelected && <View style={[StyleSheet.absoluteFill, { backgroundColor: SELECTED_OVERLAY }]} />}
                  {isTarget && !piece && (
                    <View style={[styles.moveDot, { backgroundColor: LEGAL_DOT }]} />
                  )}
                  {isTarget && piece && (
                    <View style={[styles.captureRing, { borderColor: CAPTURE_RING }]} />
                  )}
                  {isFirstFile && (
                    <Text
                      style={[
                        styles.rankLabel,
                        { fontSize: coordSize, color: isDark ? lightSquare : darkSquare },
                      ]}>
                      {rank}
                    </Text>
                  )}
                  {isLastRank && (
                    <Text
                      style={[
                        styles.fileLabel,
                        { fontSize: coordSize, color: isDark ? lightSquare : darkSquare },
                      ]}>
                      {file}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {renderPieces.map(p => (
            <Animated.View
              key={p.uid}
              style={[
                styles.pieceLayer,
                {
                  width: cellSize,
                  height: cellSize,
                  opacity: p.opacity,
                  transform: [{ translateX: p.anim.x }, { translateY: p.anim.y }],
                },
              ]}>
              <ChessPieceIcon
                type={p.type as never}
                team={p.color as 'w' | 'b'}
                size={cellSize * 0.82}
                blue={theme.identity}
                orange={theme.accent}
              />
            </Animated.View>
          ))}
        </View>
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
    borderRadius: 4,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  square: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieceLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
    opacity: 0.85,
  },
  fileLabel: {
    position: 'absolute',
    bottom: 1,
    right: 3,
    fontWeight: '700',
    opacity: 0.85,
  },
});

export default ChessBoard;
