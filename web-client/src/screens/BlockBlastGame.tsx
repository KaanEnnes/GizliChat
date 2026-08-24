import React, { useCallback, useMemo, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { submitScore } from '../services/leaderboardService';
import { getSavedPlayerName } from '../services/playerNameStorage';

interface Props {
  onBack: () => void;
}

type CellCoord = [number, number];
type Board = string[][];
type Difficulty = 'easy' | 'normal' | 'hard';
type ScreenState = 'menu' | 'playing' | 'gameover';

const BOARD_SIZE = 8;
const BEST_KEY = 'gizlichat_blockblast_best';

const BLOCK_COLORS = ['#FF6B6B', '#FFB84D', '#FFE066', '#6BCB77', '#4D96FF', '#9D6BFF', '#FF6BC7'];

// Same shape catalogue as the mobile app's HomeScreen.tsx (Block Blast-style pieces).
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

const DIFFICULTY_META: Record<Difficulty, { label: string; description: string; multiplier: number; accent: string }> = {
  easy: { label: 'KOLAY', description: 'Küçük, basit parçalar. Rahat bir başlangıç.', multiplier: 1, accent: '#6BCB77' },
  normal: { label: 'NORMAL', description: 'Dengeli parça dağılımı, klasik oyun hissi.', multiplier: 1.15, accent: '#4D96FF' },
  hard: { label: 'ZOR', description: 'Büyük, karmaşık parçalar. Daha yüksek skor çarpanı.', multiplier: 1.35, accent: '#FF6B6B' },
};

interface Piece {
  id: number;
  cells: CellCoord[];
  color: string;
  rows: number;
  cols: number;
}

function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(''));
}

function shapeWeight(difficulty: Difficulty, size: number): number {
  if (difficulty === 'easy') return size <= 2 ? 5 : size <= 4 ? 2 : 1;
  if (difficulty === 'hard') return size <= 2 ? 1 : size <= 4 ? 3 : 4;
  return size <= 2 ? 2 : size <= 4 ? 4 : 2;
}

function pickShape(difficulty: Difficulty): CellCoord[] {
  const weighted = SHAPE_DEFS.flatMap(shape => Array(shapeWeight(difficulty, shape.length)).fill(shape));
  return weighted[Math.floor(Math.random() * weighted.length)];
}

let pieceIdCounter = 1;
function makePiece(difficulty: Difficulty): Piece {
  const cells = pickShape(difficulty);
  const rows = Math.max(...cells.map(([r]) => r)) + 1;
  const cols = Math.max(...cells.map(([, c]) => c)) + 1;
  const color = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];
  return { id: pieceIdCounter++, cells, color, rows, cols };
}
function generateTray(difficulty: Difficulty): (Piece | null)[] {
  return [makePiece(difficulty), makePiece(difficulty), makePiece(difficulty)];
}

function canPlacePieceAt(board: Board, piece: Piece, anchorRow: number, anchorCol: number): boolean {
  return piece.cells.every(([dr, dc]) => {
    const r = anchorRow + dr;
    const c = anchorCol + dc;
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && !board[r][c];
  });
}
function canPlacePieceAnywhere(board: Board, piece: Piece): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (canPlacePieceAt(board, piece, r, c)) return true;
  return false;
}
function anyPieceFits(board: Board, pieces: (Piece | null)[]): boolean {
  return pieces.some(piece => piece !== null && canPlacePieceAnywhere(board, piece));
}

function clearFullLines(board: Board): { board: Board; cleared: number } {
  const fullRows: number[] = [];
  const fullCols: number[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) if (board[r].every(cell => cell)) fullRows.push(r);
  for (let c = 0; c < BOARD_SIZE; c++) if (board.every(row => row[c])) fullCols.push(c);
  if (fullRows.length === 0 && fullCols.length === 0) return { board, cleared: 0 };
  const next = board.map(row => [...row]);
  fullRows.forEach(r => { for (let c = 0; c < BOARD_SIZE; c++) next[r][c] = ''; });
  fullCols.forEach(c => { for (let r = 0; r < BOARD_SIZE; r++) next[r][c] = ''; });
  return { board: next, cleared: fullRows.length + fullCols.length };
}

function BlockBlastGame({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [screen, setScreen] = useState<ScreenState>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [board, setBoard] = useState<Board>(createEmptyBoard);
  const [tray, setTray] = useState<(Piece | null)[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0);

  const selectedPiece = selectedIndex !== null ? tray[selectedIndex] : null;

  const startGame = useCallback((diff: Difficulty) => {
    setDifficulty(diff);
    setBoard(createEmptyBoard());
    setTray(generateTray(diff));
    setSelectedIndex(null);
    setHoverCell(null);
    setScore(0);
    setScreen('playing');
  }, []);

  const handlePlace = useCallback(
    (anchorRow: number, anchorCol: number) => {
      if (selectedIndex === null || !selectedPiece) return;
      if (!canPlacePieceAt(board, selectedPiece, anchorRow, anchorCol)) return;

      const nextBoard = board.map(row => [...row]);
      selectedPiece.cells.forEach(([dr, dc]) => {
        nextBoard[anchorRow + dr][anchorCol + dc] = selectedPiece.color;
      });
      const { board: clearedBoard, cleared } = clearFullLines(nextBoard);
      const multiplier = DIFFICULTY_META[difficulty].multiplier;
      const gained = Math.round((selectedPiece.cells.length * 2 + cleared * 100) * multiplier);

      const nextTray = [...tray];
      nextTray[selectedIndex] = null;
      const trayEmpty = nextTray.every(p => p === null);
      const finalTray = trayEmpty ? generateTray(difficulty) : nextTray;

      setBoard(clearedBoard);
      setTray(finalTray);
      setSelectedIndex(null);
      setHoverCell(null);
      setScore(prev => {
        const next = prev + gained;
        if (next > bestScore) {
          setBestScore(next);
          localStorage.setItem(BEST_KEY, String(next));
        }
        return next;
      });

      if (!anyPieceFits(clearedBoard, finalTray)) {
        setScreen('gameover');
        const finalScore = score + gained;
        if (finalScore > 0) submitScore(getSavedPlayerName() || 'Oyuncu', finalScore, 'blockBlast').catch(() => undefined);
      }
    },
    [selectedIndex, selectedPiece, board, tray, difficulty, score, bestScore],
  );

  const previewCells = useMemo(() => {
    if (!selectedPiece || !hoverCell) return { valid: false, cells: new Set<string>() };
    const [row, col] = hoverCell;
    const valid = canPlacePieceAt(board, selectedPiece, row, col);
    const cells = new Set(selectedPiece.cells.map(([dr, dc]) => `${row + dr}:${col + dc}`));
    return { valid, cells };
  }, [selectedPiece, hoverCell, board]);

  if (screen === 'menu') {
    return (
      <div className="game-screen" style={{ background: theme.background }}>
        <div className="game-header">
          <span className="game-menu-link" style={{ color: theme.textMuted }} onClick={onBack}>‹ Menü</span>
          <span className="game-title" style={{ color: theme.text }}>BLOK ÇILGINLIĞI</span>
          <div className="game-header-right" />
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 18, textAlign: 'center' }}>Zorluk seç ve başla</div>
        {(Object.keys(DIFFICULTY_META) as Difficulty[]).map(diff => (
          <div key={diff} className="blockblast-diff-btn" style={{ background: theme.surface, borderColor: theme.border }} onClick={() => startGame(diff)}>
            <div style={{ fontWeight: 800, fontSize: 14, color: DIFFICULTY_META[diff].accent, marginBottom: 4 }}>{DIFFICULTY_META[diff].label}</div>
            <div style={{ fontSize: 12, color: theme.textMuted }}>{DIFFICULTY_META[diff].description}</div>
          </div>
        ))}
        {bestScore > 0 && <div style={{ marginTop: 10, fontSize: 13, color: theme.textFaint }}>🏅 En yüksek skor: {bestScore}</div>}
      </div>
    );
  }

  return (
    <div className="game-screen" style={{ background: theme.background }}>
      <div className="game-header">
        <span className="game-menu-link" style={{ color: theme.textMuted }} onClick={onBack}>‹ Menü</span>
        <span className="game-title" style={{ color: theme.text, fontSize: 15 }}>BLOK ÇILGINLIĞI</span>
        <div className="game-header-right" />
      </div>

      <div className="game-stats-row">
        <div className="game-stat-card" style={{ background: theme.surface, borderColor: theme.border }}>
          <div className="game-stat-label" style={{ color: theme.textFaint }}>SKOR</div>
          <div className="game-stat-value" style={{ color: theme.text }}>{score}</div>
        </div>
        <div className="game-stat-card" style={{ background: theme.surface, borderColor: theme.border }}>
          <div className="game-stat-label" style={{ color: theme.textFaint }}>EN YÜKSEK</div>
          <div className="game-stat-value" style={{ color: theme.text }}>{bestScore}</div>
        </div>
      </div>

      <div className="game-board-wrap">
        <div
          className="blockblast-board"
          style={{ background: theme.surfaceAlt, borderColor: theme.border, gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`, gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)` }}>
          {board.map((row, r) =>
            row.map((cellColor, c) => {
              const key = `${r}:${c}`;
              const isPreview = previewCells.cells.has(key);
              return (
                <div
                  key={key}
                  className="blockblast-cell"
                  style={{
                    background: cellColor || (isPreview ? (previewCells.valid ? `${selectedPiece?.color}88` : 'rgba(220,50,50,0.35)') : theme.background),
                  }}
                  onMouseEnter={() => setHoverCell([r, c])}
                  onClick={() => handlePlace(r, c)}
                />
              );
            }),
          )}
        </div>
        {screen === 'gameover' && (
          <div className="game-overlay" style={{ background: theme.overlay }}>
            <div className="game-overlay-title" style={{ color: theme.text }}>OYUN BİTTİ</div>
            <div className="game-overlay-sub" style={{ color: theme.textMuted }}>Skor: {score}</div>
            <button className="game-restart-btn" style={{ background: theme.accent, color: theme.accentText }} onClick={() => startGame(difficulty)}>
              TEKRAR OYNA
            </button>
          </div>
        )}
      </div>

      <div className="blockblast-tray">
        {tray.map((piece, index) => (
          <div
            key={piece ? piece.id : `empty-${index}`}
            className={`blockblast-piece ${selectedIndex === index ? 'selected' : ''}`}
            style={{
              background: theme.surface,
              borderColor: theme.border,
              outlineColor: theme.accent,
              gridTemplateColumns: piece ? `repeat(${piece.cols}, 14px)` : undefined,
              gridTemplateRows: piece ? `repeat(${piece.rows}, 14px)` : undefined,
              visibility: piece ? 'visible' : 'hidden',
              opacity: piece ? 1 : 0,
            }}
            onClick={() => piece && setSelectedIndex(index)}>
            {piece &&
              Array.from({ length: piece.rows * piece.cols }).map((_, i) => {
                const r = Math.floor(i / piece.cols);
                const c = i % piece.cols;
                const filled = piece.cells.some(([pr, pc]) => pr === r && pc === c);
                return <div key={i} className="blockblast-piece-cell" style={{ background: filled ? piece.color : 'transparent' }} />;
              })}
          </div>
        ))}
      </div>
      <div className="game-hint" style={{ color: theme.textFaint }}>Bir parça seç, tahtaya tıklayarak yerleştir. Satır/sütun doldur, temizle!</div>
    </div>
  );
}

export default BlockBlastGame;
