import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { Chess } from '../services/gameService';
import { classifyMove, MOVE_QUALITY_LABELS, type MoveQuality } from '../services/chessBotService';
import ChessPieceIcon, { shadeColor } from './chessPieceIcons';

const CHESS_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

interface Props {
  fen: string;
  myColor: 'w' | 'b' | null;
  isMyTurn: boolean;
  onMove: (from: string, to: string) => void;
}

interface PositionedPiece {
  id: number;
  square: string;
  type: string;
  color: 'w' | 'b';
}

interface MoveLogEntry {
  index: number;
  san: string;
  color: 'w' | 'b';
  quality: MoveQuality | null;
  analyzing: boolean;
}

function squareCoords(square: string): { file: number; rank: number } {
  return { file: CHESS_FILES.indexOf(square[0]), rank: parseInt(square[1], 10) - 1 };
}

/** Castling also visually moves the rook — chess.js's move object only reports the king's from/to, so the rook's own animation pair is derived from the standard castling squares. */
function castleRookMove(color: 'w' | 'b', flags: string): { from: string; to: string } | null {
  if (flags.includes('k')) return color === 'w' ? { from: 'h1', to: 'f1' } : { from: 'h8', to: 'f8' };
  if (flags.includes('q')) return color === 'w' ? { from: 'a1', to: 'd1' } : { from: 'a8', to: 'd8' };
  return null;
}

/** Interactive, animated chess board with a move-log + live move-quality side panel — shared by the contact-mode game, room-code games, and vs-bot mode. */
function ChessBoardView({ fen, myColor, isMyTurn, onMove }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const [pieces, setPieces] = useState<PositionedPiece[]>([]);
  const [moveLog, setMoveLog] = useState<MoveLogEntry[]>([]);
  const chess = useMemo(() => new Chess(fen), [fen]);

  // Board tint derives from the app's own blue identity color instead of a
  // fixed green/cream chess.com look, so it matches whichever theme
  // (light/dark) is active — pieces then use blue vs. orange (accent) to
  // tell the two sides apart, per the app's own color language.
  const darkSquare = theme.identity;
  const lightSquare = shadeColor(theme.identity, theme.mode === 'dark' ? 0.62 : 0.58);

  const prevFenRef = useRef<string | null>(null);
  const pieceIdBySquareRef = useRef<Map<string, number>>(new Map());
  const nextIdRef = useRef(1);
  const moveIndexRef = useRef(0);

  useEffect(() => {
    const idMap = pieceIdBySquareRef.current;
    const board = chess.board(); // 8 rows, rank 8 first; each row 8 cols, file a first

    // Attempt to identify the exact move that produced this fen from the
    // previous one — gives an authoritative SAN for the move log and precise
    // from/to squares (incl. the rook on castling) for the slide animation,
    // instead of guessing purely from board-diffing.
    let played: ReturnType<Chess['moves']>[number] | null = null;
    if (prevFenRef.current && prevFenRef.current !== fen) {
      try {
        const prevChess = new Chess(prevFenRef.current);
        const candidates = prevChess.moves({ verbose: true });
        played =
          candidates.find(m => {
            const copy = new Chess(prevFenRef.current!);
            copy.move({ from: m.from, to: m.to, promotion: m.promotion ?? 'q' });
            return copy.fen() === fen;
          }) ?? null;
      } catch {
        played = null;
      }
    }

    if (played) {
      const moverColor: 'w' | 'b' = played.color as 'w' | 'b';
      const pairs: { from: string; to: string }[] = [{ from: played.from, to: played.to }];
      if (played.flags.includes('k') || played.flags.includes('q')) {
        const rookMove = castleRookMove(moverColor, played.flags);
        if (rookMove) pairs.push(rookMove);
      }
      // En passant's captured pawn vanishes from a square that isn't `to` — drop its id, no animation for a piece that just disappears.
      if (played.flags.includes('e')) {
        const capturedSquare = `${played.to[0]}${played.from[1]}`;
        idMap.delete(capturedSquare);
      } else if (played.captured) {
        idMap.delete(played.to);
      }
      pairs.forEach(({ from, to }) => {
        const id = idMap.get(from) ?? nextIdRef.current++;
        idMap.delete(from);
        idMap.set(to, id);
      });

      // Each result is attached to its own moveIndex on resolution, so
      // out-of-order responses across concurrent classifyMove calls (one per
      // move played) can never clobber the wrong move's badge.
      const moveIndex = moveIndexRef.current++;
      setMoveLog(prev => [...prev, { index: moveIndex, san: played!.san, color: moverColor, quality: null, analyzing: true }]);
      classifyMove(prevFenRef.current!, played.from, played.to, fen)
        .then(quality => {
          setMoveLog(prev => prev.map(entry => (entry.index === moveIndex ? { ...entry, quality, analyzing: false } : entry)));
        })
        .catch(() => {
          setMoveLog(prev => prev.map(entry => (entry.index === moveIndex ? { ...entry, analyzing: false } : entry)));
        });
    } else if (!prevFenRef.current) {
      // Initial mount / a brand new game — (re)build the id map from scratch, no animation.
      idMap.clear();
      board.forEach((row, rowIdx) => {
        row.forEach((piece, colIdx) => {
          if (!piece) return;
          const square = `${CHESS_FILES[colIdx]}${8 - rowIdx}`;
          idMap.set(square, nextIdRef.current++);
        });
      });
      setMoveLog([]);
      moveIndexRef.current = 0;
    }

    prevFenRef.current = fen;

    const nextPieces: PositionedPiece[] = [];
    board.forEach((row, rowIdx) => {
      row.forEach((piece, colIdx) => {
        if (!piece) return;
        const square = `${CHESS_FILES[colIdx]}${8 - rowIdx}`;
        const id = idMap.get(square) ?? nextIdRef.current++;
        idMap.set(square, id);
        nextPieces.push({ id, square, type: piece.type, color: piece.color as 'w' | 'b' });
      });
    });
    setPieces(nextPieces);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const legalTargets = useMemo(() => {
    if (!selected || !isMyTurn) return new Set<string>();
    try {
      return new Set(chess.moves({ square: selected as never, verbose: true }).map((m: { to: string }) => m.to));
    } catch {
      return new Set<string>();
    }
  }, [selected, isMyTurn, chess]);

  const ranks = myColor === 'b' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = myColor === 'b' ? [...CHESS_FILES].reverse() : CHESS_FILES;

  const handleSquareClick = (square: string) => {
    if (!isMyTurn) return;
    if (selected) {
      if (legalTargets.has(square)) {
        onMove(selected, square);
        setSelected(null);
        return;
      }
    }
    const piece = chess.get(square as never);
    setSelected(piece && piece.color === myColor ? square : null);
  };

  const flip = myColor === 'b';
  const pxPercent = (square: string) => {
    const { file, rank } = squareCoords(square);
    const col = flip ? 7 - file : file;
    const row = flip ? rank : 7 - rank;
    return { left: `${col * 12.5}%`, top: `${row * 12.5}%` };
  };

  return (
    <div className="chess-layout">
      <div className="chess-board-col">
        <div className="chess-board-modern">
          {ranks.map(rank => (
            <div key={rank} className="chess-row">
              {files.map(file => {
                const square = `${file}${rank}`;
                const isDark = (CHESS_FILES.indexOf(file) + rank) % 2 === 1;
                const isSelected = selected === square;
                const isTarget = legalTargets.has(square);
                const isOccupiedTarget = isTarget && !!chess.get(square as never);
                return (
                  <div
                    key={square}
                    className="chess-square-modern"
                    style={{ background: isDark ? darkSquare : lightSquare }}
                    onClick={() => handleSquareClick(square)}>
                    {isSelected && <div className="chess-overlay" style={{ background: 'rgba(246,246,105,0.85)' }} />}
                    {isTarget && !isOccupiedTarget && <div className="chess-move-dot" />}
                    {isTarget && isOccupiedTarget && <div className="chess-capture-ring" />}
                  </div>
                );
              })}
            </div>
          ))}
          {pieces.map(piece => (
            <span
              key={piece.id}
              className="chess-piece-modern"
              style={pxPercent(piece.square)}
              onClick={() => handleSquareClick(piece.square)}>
              <ChessPieceIcon
                type={piece.type as never}
                team={piece.color}
                size="100%"
                blue={theme.identity}
                orange={theme.accent}
              />
            </span>
          ))}
        </div>
      </div>

      <div className="chess-side-panel" style={{ background: theme.surfaceAlt, borderColor: theme.border }}>
        <div className="chess-side-title" style={{ color: theme.textMuted }}>Hamleler</div>
        <div className="chess-move-list">
          {moveLog.length === 0 && <div style={{ fontSize: 12, color: theme.textFaint, padding: '4px 2px' }}>Henüz hamle yok.</div>}
          {(() => {
            const rows: React.ReactNode[] = [];
            for (let i = 0; i < moveLog.length; i += 2) {
              const white = moveLog[i];
              const black = moveLog[i + 1];
              rows.push(
                <div key={i} className="chess-move-row">
                  <span className="chess-move-num" style={{ color: theme.textFaint }}>{i / 2 + 1}.</span>
                  <MoveCell entry={white} theme={theme} />
                  {black && <MoveCell entry={black} theme={theme} />}
                </div>,
              );
            }
            return rows;
          })()}
        </div>
      </div>
    </div>
  );
}

function MoveCell({ entry, theme }: { entry: MoveLogEntry; theme: ReturnType<typeof useTheme>['theme'] }): React.JSX.Element {
  const qualityColor: Record<MoveQuality, string> = {
    brilliant: '#26C2A3',
    best: theme.identity,
    good: theme.success,
    inaccuracy: theme.warning,
    mistake: theme.warning,
    blunder: theme.danger,
  };
  return (
    <span className="chess-move-cell">
      <span style={{ color: theme.text, fontWeight: 700, fontSize: 12.5 }}>{entry.san}</span>
      {entry.analyzing && <span className="chess-move-quality" style={{ color: theme.textFaint }}>…</span>}
      {entry.quality && (
        <span className="chess-move-quality" style={{ color: qualityColor[entry.quality] }}>
          {MOVE_QUALITY_LABELS[entry.quality]}
        </span>
      )}
    </span>
  );
}

export default ChessBoardView;
