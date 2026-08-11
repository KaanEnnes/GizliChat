import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  GestureResponderEvent,
  Modal,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playClearSound, playGameOverSound, playPlaceSound } from '../services/soundService';
import { getSavedPlayerName, savePlayerName } from '../services/playerNameStorage';
import { fetchTopScores, HighScoreEntry, submitScore } from '../services/leaderboardService';

interface Props {
  onAdminTriggerReached: () => void;
}

const REQUIRED_TAPS = 10;
const TAP_RESET_MS = 3500;

// ---------------------------------------------------------------------------
// Game constants & types
// ---------------------------------------------------------------------------

const BOARD_SIZE = 8;
const BOARD_CARD_PADDING = 10; // keep in sync with styles.boardCard.padding
const CELL_GAP = 4;
const DRAG_LIFT_OFFSET = 88; // how far above the finger the dragged piece floats
const FLASH_DURATION_MS = 260;

const BLOCK_COLORS = [
  '#FF6B6B',
  '#FFB84D',
  '#FFE066',
  '#6BCB77',
  '#4D96FF',
  '#9D6BFF',
  '#FF6BC7',
];

// Purely decorative pattern used behind the main menu (not part of gameplay).
const MENU_DECOR_PATTERN: number[][] = [
  [1, 1, 0, 0, 3, 3, 0, 5],
  [0, 1, 0, 4, 4, 3, 0, 5],
  [2, 2, 0, 4, 0, 0, 6, 5],
  [2, 2, 7, 7, 0, 6, 6, 5],
  [0, 0, 7, 0, 0, 0, 6, 0],
  [3, 3, 3, 0, 1, 1, 0, 4],
  [0, 3, 0, 2, 2, 1, 0, 4],
  [5, 5, 0, 2, 0, 0, 4, 4],
];

type CellCoord = [number, number];

type Piece = {
  id: number;
  cells: CellCoord[];
  color: string;
  rows: number;
  cols: number;
};

type Board = string[][]; // '' = empty, otherwise a color string

type ScreenState = 'menu' | 'difficulty' | 'playing' | 'gameover';

type Difficulty = 'easy' | 'normal' | 'hard';

const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard'];

const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; description: string; multiplier: number; accent: string }
> = {
  easy: {
    label: 'KOLAY',
    description: 'Küçük, basit parçalar. Rahat bir başlangıç.',
    multiplier: 1,
    accent: '#6BCB77',
  },
  normal: {
    label: 'NORMAL',
    description: 'Dengeli parça dağılımı, klasik oyun hissi.',
    multiplier: 1.15,
    accent: '#4D96FF',
  },
  hard: {
    label: 'ZOR',
    description: 'Büyük, karmaşık parçalar. Daha yüksek skor çarpanı.',
    multiplier: 1.35,
    accent: '#FF6B6B',
  },
};

// Shape definitions (Block Blast-style pieces), coordinates normalized so the
// minimum row/col is 0.
const SHAPE_DEFS: CellCoord[][] = [
  [[0, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1], [0, 2]],
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [0, 3]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [0, 1], [1, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[0, 1], [1, 0], [1, 1]],
  [[0, 0], [1, 0], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [1, 2]],
  [[0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]],
];

// Best score is kept at module scope (not component state) so it survives
// HomeScreen being unmounted, which happens whenever the app navigates to the
// admin login/chat screens and back — component state alone would reset to 0
// on every remount, but this variable lives as long as the app process does.
let persistedBestScore = 0;

function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(''));
}

// Heavier pieces get progressively more common on harder difficulties, and
// smaller pieces get rarer, so the shape pool itself drives the challenge.
function shapeWeight(difficulty: Difficulty, size: number): number {
  if (difficulty === 'easy') {
    if (size <= 2) return 5;
    if (size <= 4) return 2;
    return 1;
  }
  if (difficulty === 'hard') {
    if (size <= 2) return 1;
    if (size <= 4) return 3;
    return 4;
  }
  if (size <= 2) return 2;
  if (size <= 4) return 4;
  return 2;
}

function pickShape(difficulty: Difficulty): CellCoord[] {
  const weights = SHAPE_DEFS.map(shape => shapeWeight(difficulty, shape.length));
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < SHAPE_DEFS.length; i++) {
    if (roll < weights[i]) {
      return SHAPE_DEFS[i];
    }
    roll -= weights[i];
  }
  return SHAPE_DEFS[SHAPE_DEFS.length - 1];
}

function makePiece(id: number, difficulty: Difficulty): Piece {
  const shape = pickShape(difficulty);
  const color = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
  const rows = Math.max(...shape.map(([r]) => r)) + 1;
  const cols = Math.max(...shape.map(([, c]) => c)) + 1;
  return { id, cells: shape, color, rows, cols };
}

function makePieceSet(startId: number, difficulty: Difficulty): Piece[] {
  return [
    makePiece(startId, difficulty),
    makePiece(startId + 1, difficulty),
    makePiece(startId + 2, difficulty),
  ];
}

function canPlacePieceAt(
  board: Board,
  piece: Piece,
  anchorRow: number,
  anchorCol: number,
): boolean {
  for (const [dr, dc] of piece.cells) {
    const r = anchorRow + dr;
    const c = anchorCol + dc;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
      return false;
    }
    if (board[r][c] !== '') {
      return false;
    }
  }
  return true;
}

function canPlacePieceAnywhere(board: Board, piece: Piece): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (canPlacePieceAt(board, piece, r, c)) {
        return true;
      }
    }
  }
  return false;
}

function hasAnyValidMove(board: Board, pieces: (Piece | null)[]): boolean {
  return pieces.some(piece => piece !== null && canPlacePieceAnywhere(board, piece));
}

function placePieceOnBoard(
  board: Board,
  piece: Piece,
  anchorRow: number,
  anchorCol: number,
): Board {
  const next = board.map(row => [...row]);
  piece.cells.forEach(([dr, dc]) => {
    next[anchorRow + dr][anchorCol + dc] = piece.color;
  });
  return next;
}

function clearFullLines(board: Board): {
  board: Board;
  cleared: number;
  clearedCells: CellCoord[];
} {
  const fullRows: number[] = [];
  const fullCols: number[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every(cell => cell !== '')) {
      fullRows.push(r);
    }
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let full = true;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (board[r][c] === '') {
        full = false;
        break;
      }
    }
    if (full) {
      fullCols.push(c);
    }
  }

  if (fullRows.length === 0 && fullCols.length === 0) {
    return { board, cleared: 0, clearedCells: [] };
  }

  const next = board.map(row => [...row]);
  const clearedCellKeys = new Set<string>();
  const clearedCells: CellCoord[] = [];

  const markCleared = (r: number, c: number) => {
    const key = `${r}:${c}`;
    if (!clearedCellKeys.has(key)) {
      clearedCellKeys.add(key);
      clearedCells.push([r, c]);
    }
    next[r][c] = '';
  };

  fullRows.forEach(r => {
    for (let c = 0; c < BOARD_SIZE; c++) {
      markCleared(r, c);
    }
  });
  fullCols.forEach(c => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      markCleared(r, c);
    }
  });

  return { board: next, cleared: fullRows.length + fullCols.length, clearedCells };
}

function renderMiniGrid(piece: Piece) {
  const grid: boolean[][] = Array.from({ length: piece.rows }, () =>
    Array(piece.cols).fill(false),
  );
  piece.cells.forEach(([r, c]) => {
    grid[r][c] = true;
  });

  return (
    <View>
      {grid.map((row, ri) => (
        <View key={`prow-${ri}`} style={styles.pieceRow}>
          {row.map((filled, ci) => (
            <View
              key={`pcell-${ri}-${ci}`}
              style={[
                styles.pieceCell,
                filled ? { backgroundColor: piece.color } : styles.pieceCellEmpty,
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// Larger rendering of a piece used for the floating "ghost" while dragging,
// sized to match the real board's cell size so it previews true-to-scale.
function renderGhostGrid(piece: Piece, cellSize: number) {
  const grid: boolean[][] = Array.from({ length: piece.rows }, () =>
    Array(piece.cols).fill(false),
  );
  piece.cells.forEach(([r, c]) => {
    grid[r][c] = true;
  });

  return (
    <View>
      {grid.map((row, ri) => (
        <View key={`grow-${ri}`} style={styles.ghostRow}>
          {row.map((filled, ci) => (
            <View
              key={`gcell-${ri}-${ci}`}
              style={{ width: cellSize, height: cellSize, padding: CELL_GAP / 2 }}>
              {filled && (
                <View style={[styles.ghostCell, { backgroundColor: piece.color }]}>
                  <View style={styles.cellHighlight} />
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function renderDecorCells(cellSize: number) {
  const cells: React.ReactNode[] = [];
  MENU_DECOR_PATTERN.forEach((row, r) => {
    row.forEach((value, c) => {
      const filled = value !== 0;
      const color = filled ? BLOCK_COLORS[(value - 1) % BLOCK_COLORS.length] : undefined;
      cells.push(
        <View
          key={`decor-${r}-${c}`}
          style={[
            styles.cell,
            {
              left: c * cellSize + CELL_GAP / 2,
              top: r * cellSize + CELL_GAP / 2,
              width: cellSize - CELL_GAP,
              height: cellSize - CELL_GAP,
            },
            filled ? { backgroundColor: color } : styles.cellEmpty,
          ]}>
          {filled && <View style={styles.cellHighlight} />}
        </View>,
      );
    });
  });
  return cells;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function HomeScreen({ onAdminTriggerReached }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // --- Preserved admin tap-trigger mechanism (unchanged logic) -------------
  const [, setTapCount] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = useCallback(() => {
    if (resetTimer.current) {
      clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }
  }, []);

  const handleIconPress = useCallback(() => {
    clearResetTimer();

    setTapCount(prev => {
      const next = prev + 1;

      if (next >= REQUIRED_TAPS) {
        setTimeout(() => onAdminTriggerReached(), 0);
        return 0;
      }

      resetTimer.current = setTimeout(() => {
        setTapCount(0);
        resetTimer.current = null;
      }, TAP_RESET_MS);

      return next;
    });
  }, [clearResetTimer, onAdminTriggerReached]);

  useEffect(() => {
    return () => clearResetTimer();
  }, [clearResetTimer]);
  // --------------------------------------------------------------------------

  // --- Game state ------------------------------------------------------------
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [board, setBoard] = useState<Board>(createEmptyBoard());
  const [pieces, setPieces] = useState<(Piece | null)[]>([null, null, null]);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(persistedBestScore);
  const pieceIdRef = useRef(0);
  // Tracks the just-computed score synchronously so game-over handling (which
  // can fire either immediately or after a line-clear flash timeout) always
  // submits the correct final score, without waiting on React's render cycle.
  const finalScoreRef = useRef(0);

  useEffect(() => {
    persistedBestScore = bestScore;
  }, [bestScore]);

  // --- Player name (asked once) + leaderboard -----------------------------
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [leaderboardVisible, setLeaderboardVisible] = useState(false);
  const [leaderboard, setLeaderboard] = useState<HighScoreEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  useEffect(() => {
    getSavedPlayerName().then(setPlayerName);
  }, []);

  const submitFinalScore = useCallback((name: string, finalScore: number) => {
    submitScore(name, finalScore).catch(() => {
      // Non-critical: leaderboard submission failing shouldn't block play.
    });
  }, []);

  const triggerGameOver = useCallback(
    (finalScore: number) => {
      finalScoreRef.current = finalScore;
      playGameOverSound();
      setScreen('gameover');
      if (playerName) {
        submitFinalScore(playerName, finalScore);
      } else {
        setNameDraft('');
        setNameModalVisible(true);
      }
    },
    [playerName, submitFinalScore],
  );

  const handleNameSubmit = useCallback(async () => {
    const clean = nameDraft.trim().slice(0, 24) || 'Oyuncu';
    setSavingName(true);
    try {
      await savePlayerName(clean);
      setPlayerName(clean);
      submitFinalScore(clean, finalScoreRef.current);
      setNameModalVisible(false);
    } finally {
      setSavingName(false);
    }
  }, [nameDraft, submitFinalScore]);

  const handleShowLeaderboard = useCallback(() => {
    setLeaderboardVisible(true);
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    fetchTopScores()
      .then(setLeaderboard)
      .catch(error => setLeaderboardError(`Skor tablosu yüklenemedi: ${error.message}`))
      .finally(() => setLeaderboardLoading(false));
  }, []);

  // --- Drag & drop state -------------------------------------------------
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragValid, setDragValid] = useState(false);
  const [previewCells, setPreviewCells] = useState<CellCoord[]>([]);
  const [flashCells, setFlashCells] = useState<CellCoord[]>([]);

  const pieceRefs = useRef<(View | null)[]>([null, null, null]);
  const boardGridRef = useRef<View>(null);
  const boardOriginRef = useRef({ x: 0, y: 0, size: 0 });
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragAnchorRef = useRef<{ row: number; col: number } | null>(null);
  const dragValidRef = useRef(false);
  const lastPreviewKey = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ghostPos = useRef(new Animated.ValueXY()).current;
  const ghostScale = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scorePulse = useRef(new Animated.Value(1)).current;
  const boardPulse = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;
  const decorPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(decorPulse, { toValue: 0.94, duration: 1500, useNativeDriver: true }),
        Animated.timing(decorPulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [decorPulse]);

  useEffect(() => {
    return () => {
      if (flashTimer.current) {
        clearTimeout(flashTimer.current);
      }
    };
  }, []);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const triggerScorePulse = useCallback(() => {
    scorePulse.setValue(1);
    Animated.sequence([
      Animated.timing(scorePulse, { toValue: 1.22, duration: 110, useNativeDriver: true }),
      Animated.timing(scorePulse, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [scorePulse]);

  const triggerBoardPulse = useCallback(
    (strength: number) => {
      boardPulse.setValue(1);
      Animated.sequence([
        Animated.timing(boardPulse, { toValue: strength, duration: 90, useNativeDriver: true }),
        Animated.timing(boardPulse, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    },
    [boardPulse],
  );

  const clearFlashTimer = useCallback(() => {
    if (flashTimer.current) {
      clearTimeout(flashTimer.current);
      flashTimer.current = null;
    }
  }, []);

  const startNewGame = useCallback(
    (level: Difficulty) => {
      clearFlashTimer();
      setDifficulty(level);
      setBoard(createEmptyBoard());
      setPieces(makePieceSet(pieceIdRef.current + 1, level));
      pieceIdRef.current += 3;
      setScore(0);
      setDragIndex(null);
      setPreviewCells([]);
      setFlashCells([]);
      setScreen('playing');
    },
    [clearFlashTimer],
  );

  const handlePlayPress = useCallback(() => {
    setScreen('difficulty');
  }, []);

  const handleBackToMenu = useCallback(() => {
    clearFlashTimer();
    setScreen('menu');
    setDragIndex(null);
    setPreviewCells([]);
  }, [clearFlashTimer]);

  // --- Placement (shared by a successful drag-drop) -----------------------
  const performDrop = useCallback(
    (pieceIndex: number, piece: Piece, anchorRow: number, anchorCol: number) => {
      if (!canPlacePieceAt(board, piece, anchorRow, anchorCol)) {
        return;
      }

      const placedBoard = placePieceOnBoard(board, piece, anchorRow, anchorCol);
      const cellsPlaced = piece.cells.length;
      const { board: clearedBoard, cleared, clearedCells } = clearFullLines(placedBoard);
      const multiplier = DIFFICULTY_META[difficulty].multiplier;
      const gained = Math.round((cellsPlaced * 2 + cleared * 100) * multiplier);

      setScore(prevScore => {
        const nextScore = prevScore + gained;
        finalScoreRef.current = nextScore;
        setBestScore(prevBest => Math.max(prevBest, nextScore));
        return nextScore;
      });
      triggerScorePulse();
      triggerBoardPulse(1.025);
      playPlaceSound();

      let nextPieces = pieces.map((p, i) => (i === pieceIndex ? null : p));
      const allUsed = nextPieces.every(p => p === null);
      if (allUsed) {
        nextPieces = makePieceSet(pieceIdRef.current + 1, difficulty);
        pieceIdRef.current += 3;
      }

      setBoard(placedBoard);
      setPieces(nextPieces);

      if (cleared > 0) {
        playClearSound();
        setFlashCells(clearedCells);
        flashAnim.setValue(1);
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: FLASH_DURATION_MS,
          useNativeDriver: true,
        }).start();
        triggerBoardPulse(1.05);

        clearFlashTimer();
        flashTimer.current = setTimeout(() => {
          setBoard(clearedBoard);
          setFlashCells([]);
          if (!hasAnyValidMove(clearedBoard, nextPieces)) {
            triggerGameOver(finalScoreRef.current);
          }
        }, FLASH_DURATION_MS);
      } else if (!hasAnyValidMove(placedBoard, nextPieces)) {
        triggerGameOver(finalScoreRef.current);
      }
    },
    [
      board,
      pieces,
      difficulty,
      triggerScorePulse,
      triggerBoardPulse,
      flashAnim,
      clearFlashTimer,
      triggerGameOver,
    ],
  );

  // --- Drag gesture plumbing ----------------------------------------------
  const boardSize = Math.min(width - 48, 340);
  const innerBoardSize = boardSize - BOARD_CARD_PADDING * 2;
  const cellSize = innerBoardSize / BOARD_SIZE;

  const updateGhostAndPreview = useCallback(
    (piece: Piece, moveX: number, moveY: number) => {
      const origin = boardOriginRef.current;
      const size = origin.size > 0 ? origin.size : innerBoardSize;
      const cellPx = size / BOARD_SIZE;

      const pieceWidthPx = piece.cols * cellPx;
      const pieceHeightPx = piece.rows * cellPx;

      const ghostLeft = moveX - pieceWidthPx / 2;
      const ghostTop = moveY - DRAG_LIFT_OFFSET - pieceHeightPx / 2;
      ghostPos.setValue({ x: ghostLeft, y: ghostTop });

      const anchorCol = Math.round((ghostLeft - origin.x) / cellPx);
      const anchorRow = Math.round((ghostTop - origin.y) / cellPx);
      const valid = origin.size > 0 && canPlacePieceAt(board, piece, anchorRow, anchorCol);

      dragAnchorRef.current = { row: anchorRow, col: anchorCol };
      dragValidRef.current = valid;

      const key = `${anchorRow}:${anchorCol}:${valid}`;
      if (key === lastPreviewKey.current) {
        return;
      }
      lastPreviewKey.current = key;

      setDragValid(valid);
      const cells: CellCoord[] = [];
      piece.cells.forEach(([dr, dc]) => {
        const r = anchorRow + dr;
        const c = anchorCol + dc;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          cells.push([r, c]);
        }
      });
      setPreviewCells(cells);
    },
    [board, ghostPos, innerBoardSize],
  );

  const finalizeDrag = useCallback(
    (index: number) => {
      const piece = pieces[index];
      const anchor = dragAnchorRef.current;
      const valid = dragValidRef.current;

      if (piece && anchor && valid) {
        performDrop(index, piece, anchor.row, anchor.col);
        setDragIndex(null);
      } else {
        triggerShake();
        const origin = dragOriginRef.current;
        if (origin) {
          Animated.spring(ghostPos, {
            toValue: { x: origin.x, y: origin.y },
            friction: 6,
            useNativeDriver: true,
          }).start(() => setDragIndex(null));
        } else {
          setDragIndex(null);
        }
      }

      setPreviewCells([]);
      setDragValid(false);
      dragAnchorRef.current = null;
      dragValidRef.current = false;
      lastPreviewKey.current = null;
    },
    [pieces, performDrop, triggerShake, ghostPos],
  );

  function panResponderFor(index: number) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () =>
        screen === 'playing' && dragIndex === null && pieces[index] !== null,
      onMoveShouldSetPanResponder: () =>
        screen === 'playing' && dragIndex === null && pieces[index] !== null,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const piece = pieces[index];
        if (!piece) {
          return;
        }
        setDragIndex(index);
        setDragValid(false);
        setPreviewCells([]);
        lastPreviewKey.current = null;

        ghostScale.setValue(0.85);
        Animated.spring(ghostScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();

        pieceRefs.current[index]?.measure((_x, _y, _w, _h, pageX, pageY) => {
          dragOriginRef.current = { x: pageX, y: pageY };
        });

        boardGridRef.current?.measure((_x, _y, measuredWidth, _h, pageX, pageY) => {
          boardOriginRef.current = { x: pageX, y: pageY, size: measuredWidth };
        });

        updateGhostAndPreview(piece, gestureState.moveX, gestureState.moveY);
      },
      onPanResponderMove: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const piece = pieces[index];
        if (!piece) {
          return;
        }
        updateGhostAndPreview(piece, gestureState.moveX, gestureState.moveY);
      },
      onPanResponderRelease: () => finalizeDrag(index),
      onPanResponderTerminate: () => finalizeDrag(index),
    });
  }

  const shakeTranslate = shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });
  const previewSet = useMemo(
    () => new Set(previewCells.map(([r, c]) => `${r}:${c}`)),
    [previewCells],
  );
  const flashSet = useMemo(() => new Set(flashCells.map(([r, c]) => `${r}:${c}`)), [flashCells]);
  const draggedPiece = dragIndex !== null ? pieces[dragIndex] : null;

  return (
    <View style={styles.container}>
      {screen === 'menu' && (
        <View
          style={[
            styles.menuContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
          ]}>
          <View style={styles.header}>
            <Text style={styles.title}>BLOK ÇILGINLIĞI</Text>
            <Text style={styles.subtitle}>Blokları birleştir, sıraları temizle!</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>SON SKOR</Text>
              <Text style={styles.statValue}>{score}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>EN YÜKSEK</Text>
              <Text style={styles.statValue}>{bestScore}</Text>
            </View>
          </View>

          <Animated.View
            style={[
              styles.boardCard,
              { width: boardSize, height: boardSize, transform: [{ scale: decorPulse }] },
            ]}>
            <View style={{ width: innerBoardSize, height: innerBoardSize }}>
              {renderDecorCells(cellSize)}
            </View>
          </Animated.View>

          <Pressable
            onPress={handlePlayPress}
            style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Oyuna başla">
            <Text style={styles.playButtonText}>OYNA</Text>
          </Pressable>
        </View>
      )}

      {screen === 'difficulty' && (
        <View
          style={[
            styles.difficultyContent,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
          ]}>
          <Pressable
            onPress={() => setScreen('menu')}
            hitSlop={8}
            style={styles.difficultyBack}
            accessibilityRole="button"
            accessibilityLabel="Ana menüye dön">
            <Text style={styles.menuLink}>‹ Menü</Text>
          </Pressable>

          <Text style={styles.difficultyTitle}>ZORLUK SEÇ</Text>
          <Text style={styles.subtitle}>Oyuna başlamadan önce bir seviye seç.</Text>

          <View style={styles.difficultyList}>
            {DIFFICULTY_ORDER.map(level => {
              const meta = DIFFICULTY_META[level];
              return (
                <Pressable
                  key={level}
                  onPress={() => startNewGame(level)}
                  style={({ pressed }) => [
                    styles.difficultyCard,
                    { borderColor: meta.accent },
                    pressed && styles.difficultyCardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${meta.label} zorlukta oyna`}>
                  <View style={[styles.difficultyDot, { backgroundColor: meta.accent }]} />
                  <View style={styles.difficultyTextWrap}>
                    <Text style={[styles.difficultyLabel, { color: meta.accent }]}>
                      {meta.label}
                    </Text>
                    <Text style={styles.difficultyDescription}>{meta.description}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {(screen === 'playing' || screen === 'gameover') && (
        <View
          style={[
            styles.gameContent,
            { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
          ]}>
          <View style={styles.gameHeader}>
            <Pressable
              onPress={handleBackToMenu}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Ana menüye dön">
              <Text style={styles.menuLink}>‹ Menü</Text>
            </Pressable>
            <Animated.Text style={[styles.scoreText, { transform: [{ scale: scorePulse }] }]}>
              {score}
            </Animated.Text>
            <Text style={styles.bestText}>En iyi: {bestScore}</Text>
          </View>

          <Animated.View
            style={[
              styles.boardCard,
              {
                width: boardSize,
                height: boardSize,
                transform: [{ translateX: shakeTranslate }, { scale: boardPulse }],
              },
            ]}>
            <View
              ref={boardGridRef}
              style={{ width: innerBoardSize, height: innerBoardSize }}
              collapsable={false}>
              {board.map((row, r) =>
                row.map((cellColor, c) => {
                  const key = `${r}:${c}`;
                  const filled = cellColor !== '';
                  const isPreview = previewSet.has(key);
                  const isFlash = flashSet.has(key);
                  return (
                    <View
                      key={key}
                      style={[
                        styles.cell,
                        {
                          left: c * cellSize + CELL_GAP / 2,
                          top: r * cellSize + CELL_GAP / 2,
                          width: cellSize - CELL_GAP,
                          height: cellSize - CELL_GAP,
                        },
                        filled ? { backgroundColor: cellColor } : styles.cellEmpty,
                        isPreview && (dragValid ? styles.cellPreviewValid : styles.cellPreviewInvalid),
                      ]}>
                      {filled && <View style={styles.cellHighlight} />}
                      {isFlash && (
                        <Animated.View
                          pointerEvents="none"
                          style={[styles.cellFlash, { opacity: flashAnim }]}
                        />
                      )}
                    </View>
                  );
                }),
              )}
            </View>
          </Animated.View>

          <View style={styles.piecesRow}>
            {pieces.map((piece, index) => (
              <View
                key={piece ? `piece-${piece.id}` : `empty-${index}`}
                ref={el => {
                  pieceRefs.current[index] = el;
                }}
                collapsable={false}
                {...(piece ? panResponderFor(index).panHandlers : {})}
                style={[
                  styles.pieceCard,
                  !piece && styles.pieceCardEmpty,
                  dragIndex === index && styles.pieceCardDragging,
                ]}>
                {piece && dragIndex !== index && renderMiniGrid(piece)}
              </View>
            ))}
          </View>

          {screen === 'gameover' && (
            <View style={styles.gameOverOverlay}>
              <View style={styles.gameOverCard}>
                <Text style={styles.gameOverTitle}>OYUN BİTTİ</Text>
                <Text style={styles.gameOverScore}>Skor: {score}</Text>
                <Text style={styles.gameOverBest}>En yüksek: {bestScore}</Text>
                <Pressable
                  onPress={() => startNewGame(difficulty)}
                  style={({ pressed }) => [
                    styles.playButton,
                    styles.replayButton,
                    pressed && styles.playButtonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Tekrar oyna">
                  <Text style={styles.playButtonText}>TEKRAR OYNA</Text>
                </Pressable>
                <Pressable
                  onPress={handleShowLeaderboard}
                  hitSlop={8}
                  style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>🏆 Skor Tablosu</Text>
                </Pressable>
                <Pressable onPress={handleBackToMenu} hitSlop={8} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>Ana Menü</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {dragIndex !== null && draggedPiece && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ghostWrap,
            {
              transform: [...ghostPos.getTranslateTransform(), { scale: ghostScale }],
            },
          ]}>
          <View
            style={[
              styles.ghostGlow,
              dragValid ? styles.ghostGlowValid : styles.ghostGlowInvalid,
            ]}>
            {renderGhostGrid(draggedPiece, cellSize)}
          </View>
        </Animated.View>
      )}

      <Pressable
        onPress={handleIconPress}
        accessibilityRole="button"
        accessibilityLabel="Admin girişi"
        style={[styles.adminIcon, { bottom: insets.bottom + 20, right: insets.right + 20 }]}
        hitSlop={10}>
        <Text style={styles.adminIconText}>⚙</Text>
      </Pressable>

      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Skor tablosuna adını ekle</Text>
            <Text style={styles.modalSubtitle}>
              Bu isim bir daha sorulmayacak, sonraki oyunlarda otomatik kullanılacak.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Adın"
              placeholderTextColor="rgba(245,245,247,0.4)"
              value={nameDraft}
              onChangeText={setNameDraft}
              maxLength={24}
              autoFocus
              editable={!savingName}
              onSubmitEditing={handleNameSubmit}
            />
            <Pressable
              style={[styles.playButton, styles.modalSubmitButton, savingName && styles.playButtonPressed]}
              onPress={handleNameSubmit}
              disabled={savingName}>
              {savingName ? (
                <ActivityIndicator color="#0F1115" />
              ) : (
                <Text style={styles.playButtonText}>KAYDET</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={leaderboardVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaderboardVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🏆 Skor Tablosu</Text>
            {leaderboardLoading && (
              <ActivityIndicator color="#4D96FF" style={styles.leaderboardLoader} />
            )}
            {leaderboardError && <Text style={styles.errorTextModal}>{leaderboardError}</Text>}
            {!leaderboardLoading && !leaderboardError && (
              <FlatList
                data={leaderboard}
                keyExtractor={item => item.id}
                style={styles.leaderboardList}
                ListEmptyComponent={
                  <Text style={styles.leaderboardEmpty}>Henüz skor yok, ilk sen ol!</Text>
                }
                renderItem={({ item, index }) => (
                  <View style={styles.leaderboardRow}>
                    <Text style={styles.leaderboardRank}>{index + 1}.</Text>
                    <Text style={styles.leaderboardName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.leaderboardScore}>{item.score}</Text>
                  </View>
                )}
              />
            )}
            <Pressable
              onPress={() => setLeaderboardVisible(false)}
              hitSlop={8}
              style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Kapat</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12141C',
  },

  // --- Menu -------------------------------------------------------------
  menuContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#F5F5F7',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(245,245,247,0.55)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 340,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: '#1C1F2A',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statLabel: {
    color: 'rgba(245,245,247,0.45)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    color: '#F5F5F7',
    fontSize: 18,
    fontWeight: '700',
  },

  // --- Board (shared by menu decor + real game) --------------------------
  boardCard: {
    backgroundColor: '#1A1D27',
    borderRadius: 20,
    padding: BOARD_CARD_PADDING,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },

  // --- Board cells (absolute-positioned grid, used by both boards) -------
  cell: {
    position: 'absolute',
    borderRadius: 7,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  cellEmpty: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cellHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  cellFlash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
  },
  cellPreviewValid: {
    backgroundColor: 'rgba(107,203,119,0.4)',
    borderWidth: 2,
    borderColor: '#6BCB77',
  },
  cellPreviewInvalid: {
    backgroundColor: 'rgba(255,107,107,0.4)',
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },

  // --- Pieces tray --------------------------------------------------------
  piecesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  pieceCard: {
    backgroundColor: '#1C1F2A',
    borderRadius: 14,
    padding: 8,
    marginHorizontal: 6,
    minWidth: 70,
    minHeight: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pieceCardEmpty: {
    opacity: 0.25,
  },
  pieceCardDragging: {
    opacity: 0.3,
    borderColor: '#4D96FF',
  },
  pieceRow: {
    flexDirection: 'row',
  },
  pieceCell: {
    width: 14,
    height: 14,
    margin: 1.5,
    borderRadius: 4,
  },
  pieceCellEmpty: {
    backgroundColor: 'transparent',
  },

  // --- Drag ghost -----------------------------------------------------------
  ghostWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 50,
    elevation: 50,
  },
  ghostGlow: {
    borderRadius: 12,
    padding: 2,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  ghostGlowValid: {
    borderColor: '#6BCB77',
    shadowColor: '#6BCB77',
  },
  ghostGlowInvalid: {
    borderColor: '#FF6B6B',
    shadowColor: '#FF6B6B',
  },
  ghostRow: {
    flexDirection: 'row',
  },
  ghostCell: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },

  // --- Play / replay buttons ----------------------------------------------
  playButton: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#6BCB77',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#6BCB77',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  playButtonPressed: {
    opacity: 0.85,
  },
  playButtonText: {
    color: '#0F1115',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  replayButton: {
    marginTop: 4,
  },

  // --- Difficulty selection ------------------------------------------------
  difficultyContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  difficultyBack: {
    width: '100%',
    maxWidth: 340,
    marginBottom: 8,
  },
  difficultyTitle: {
    color: '#F5F5F7',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textAlign: 'center',
  },
  difficultyList: {
    width: '100%',
    maxWidth: 340,
    marginTop: 12,
  },
  difficultyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1F2A',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  difficultyCardPressed: {
    opacity: 0.8,
  },
  difficultyDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 14,
  },
  difficultyTextWrap: {
    flex: 1,
  },
  difficultyLabel: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  difficultyDescription: {
    color: 'rgba(245,245,247,0.6)',
    fontSize: 12.5,
    lineHeight: 17,
  },

  // --- In-game header -------------------------------------------------------
  gameContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  gameHeader: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  menuLink: {
    color: 'rgba(245,245,247,0.55)',
    fontSize: 14,
    fontWeight: '600',
  },
  scoreText: {
    color: '#F5F5F7',
    fontSize: 26,
    fontWeight: '800',
  },
  bestText: {
    color: 'rgba(245,245,247,0.45)',
    fontSize: 12,
    fontWeight: '600',
  },

  // --- Game over overlay ----------------------------------------------------
  gameOverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,11,15,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  gameOverCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1C1F2A',
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  gameOverTitle: {
    color: '#F5F5F7',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  gameOverScore: {
    color: '#F5F5F7',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  gameOverBest: {
    color: 'rgba(245,245,247,0.5)',
    fontSize: 13,
    marginBottom: 18,
  },
  secondaryButton: {
    marginTop: 14,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: 'rgba(245,245,247,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },

  // --- Name prompt / leaderboard modals --------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,11,15,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '80%',
    backgroundColor: '#1C1F2A',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    color: '#F5F5F7',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: 'rgba(245,245,247,0.55)',
    fontSize: 12.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0F1115',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 15,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalSubmitButton: {
    maxWidth: undefined,
  },
  leaderboardLoader: {
    marginVertical: 20,
  },
  leaderboardList: {
    maxHeight: 320,
    marginBottom: 12,
  },
  leaderboardEmpty: {
    color: 'rgba(245,245,247,0.45)',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  leaderboardRank: {
    color: 'rgba(245,245,247,0.45)',
    fontSize: 13,
    fontWeight: '700',
    width: 26,
  },
  leaderboardName: {
    flex: 1,
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  leaderboardScore: {
    color: '#6BCB77',
    fontSize: 14,
    fontWeight: '800',
  },
  errorTextModal: {
    color: '#FF6B6B',
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 16,
  },

  // --- Admin trigger icon (unchanged) ----------------------------------------
  adminIcon: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1F26',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  adminIconText: {
    fontSize: 18,
    color: 'rgba(245,245,247,0.85)',
  },
});

export default HomeScreen;
