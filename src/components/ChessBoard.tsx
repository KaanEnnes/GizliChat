import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Chess } from '../services/chessService';

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

// Fixed chess.com-style palette — the board keeps this look regardless of
// app light/dark theme, same as every mainstream chess client does.
const LIGHT_SQUARE = '#EEEED2';
const DARK_SQUARE = '#769656';
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
  const boardRef = useRef<View>(null);

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

  // ---- Drag-to-move: lets a piece be picked up and slid to its target in one
  // gesture, instead of only tap-square-then-tap-square. A plain tap (no real
  // movement) still just selects, same as before.
  const dragRef = useRef<{ square: string; piece: AnimPiece; base: { x: number; y: number } } | null>(null);
  const DRAG_THRESHOLD = cellSize * 0.25;

  // `locationX/locationY` are reported by RN relative to the responder view
  // itself (this board), not the screen — unlike a manual
  // measureInWindow()-vs-pageX/Y comparison, this can't drift out of sync
  // with the status bar, a surrounding Modal's own window, or layout timing,
  // which is what was making every touch land one row off from the piece
  // actually tapped.
  const squareAtLocalXY = (localX: number, localY: number): string | null => {
    if (localX < 0 || localY < 0 || localX >= size || localY >= size) {
      return null;
    }
    const fileIdx = Math.min(7, Math.max(0, Math.floor(localX / cellSize)));
    const rankIdx = Math.min(7, Math.max(0, Math.floor(localY / cellSize)));
    return `${files[fileIdx]}${ranks[rankIdx]}`;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Capture (not bubble) phase: without this, the square Pressables —
        // being deeper in the tree — get asked first and always claim the
        // touch for their own onPress, so this responder would never see a
        // touch that starts on a piece at all.
        onStartShouldSetPanResponderCapture: evt => {
          if (!myColor) {
            return false;
          }
          const sq = squareAtLocalXY(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
          if (!sq) {
            return false;
          }
          const piece = chess.get(sq as never);
          if (!piece || piece.color !== myColor) {
            return false;
          }
          return isMyTurn || !!allowPremove;
        },
        onPanResponderGrant: evt => {
          const sq = squareAtLocalXY(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
          if (!sq) {
            return;
          }
          setSelected(sq);
          const piece = piecesRef.current.find(p => p.square === sq);
          if (piece) {
            dragRef.current = { square: sq, piece, base: squareToXY(sq) };
          }
        },
        onPanResponderMove: (_evt, gestureState) => {
          const d = dragRef.current;
          if (!d) {
            return;
          }
          d.piece.anim.setValue({ x: d.base.x + gestureState.dx, y: d.base.y + gestureState.dy });
        },
        onPanResponderRelease: (evt, gestureState) => {
          const d = dragRef.current;
          dragRef.current = null;
          if (!d) {
            return;
          }
          const moved = Math.hypot(gestureState.dx, gestureState.dy) > DRAG_THRESHOLD;
          const snapBack = () =>
            Animated.timing(d.piece.anim, { toValue: d.base, duration: 150, useNativeDriver: true }).start();
          if (!moved) {
            snapBack();
            return;
          }
          const toSq = squareAtLocalXY(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
          if (!toSq || toSq === d.square) {
            snapBack();
            return;
          }
          if (!isMyTurn) {
            if (allowPremove && onSetPremove) {
              onSetPremove(d.square, toSq);
            }
            setSelected(null);
            snapBack();
            return;
          }
          const targets = new Set(chess.moves({ square: d.square as never, verbose: true }).map(m => m.to));
          if (targets.has(toSq)) {
            Animated.timing(d.piece.anim, { toValue: squareToXY(toSq), duration: 90, useNativeDriver: true }).start();
            onMove(d.square, toSq);
            setSelected(null);
          } else {
            snapBack();
          }
        },
        onPanResponderTerminate: () => {
          const d = dragRef.current;
          dragRef.current = null;
          if (d) {
            Animated.timing(d.piece.anim, { toValue: d.base, duration: 150, useNativeDriver: true }).start();
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myColor, isMyTurn, allowPremove, chess, cellSize, size, files, ranks],
  );

  return (
    <View
      style={[
        styles.wrap,
        { shadowColor: theme.mode === 'dark' ? '#000' : '#1E293B' },
      ]}>
      <View
        ref={boardRef}
        {...panResponder.panHandlers}
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
                      backgroundColor: isDark ? DARK_SQUARE : LIGHT_SQUARE,
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
                        { fontSize: coordSize, color: isDark ? LIGHT_SQUARE : DARK_SQUARE },
                      ]}>
                      {rank}
                    </Text>
                  )}
                  {isLastRank && (
                    <Text
                      style={[
                        styles.fileLabel,
                        { fontSize: coordSize, color: isDark ? LIGHT_SQUARE : DARK_SQUARE },
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
              <Text
                style={[
                  styles.pieceText,
                  {
                    fontSize: cellSize * 0.68,
                    textShadowColor: 'rgba(0,0,0,0.35)',
                  },
                ]}>
                {PIECE_GLYPHS[`${p.color}${p.type}`]}
              </Text>
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
