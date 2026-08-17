import { Chess } from './chessService';

export type ChessDifficulty = 'easy' | 'medium' | 'hard';

export const BOT_DIFFICULTY_LABELS: Record<ChessDifficulty, string> = {
  easy: 'Kolay',
  medium: 'Orta',
  hard: 'Zor',
};

// Search depth sent to the Stockfish Online API for medium/hard — this is
// the same engine chess.com/lichess-style apps lean on, so we don't need to
// author our own evaluation function for the "real" opponent. The API
// rejects depth < 6 ("Depth must be greater than 5"), and depth 6 already
// plays far stronger than a beginner, so "easy" skips the API entirely and
// always uses the shallow local fallback below instead.
const STOCKFISH_DEPTH: Record<ChessDifficulty, number> = {
  easy: 0,
  medium: 6,
  hard: 13,
};

// Local minimax fallback (used offline or if the API call fails/times out)
// searches shallower per difficulty so it stays fast on-device.
const LOCAL_DEPTH: Record<ChessDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export interface BotMove {
  from: string;
  to: string;
  promotion?: string;
}

function parseUciMove(uci: string): BotMove {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

async function fetchStockfishMove(fen: string, depth: number): Promise<BotMove | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${depth}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { success?: boolean; bestmove?: string };
    if (!data.success || !data.bestmove) {
      return null;
    }
    // Response looks like "bestmove e2e4 ponder e7e5"
    const uci = data.bestmove.split(' ')[1];
    if (!uci) {
      return null;
    }
    return parseUciMove(uci);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function evaluateBoard(chess: InstanceType<typeof Chess>): number {
  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) {
        continue;
      }
      const value = PIECE_VALUES[piece.type];
      score += piece.color === 'w' ? value : -value;
    }
  }
  return score;
}

/** Plain minimax with alpha-beta pruning over chess.js move generation — no opening book or piece-square tables, just enough to be a believable fallback opponent when Stockfish Online is unreachable. */
function minimax(
  chess: InstanceType<typeof Chess>,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
): number {
  if (depth === 0 || chess.isGameOver()) {
    return evaluateBoard(chess);
  }
  const moves = chess.moves({ verbose: true });
  if (maximizing) {
    let best = -Infinity;
    for (const move of moves) {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta, false));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) {
        break;
      }
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
    best = Math.min(best, minimax(chess, depth - 1, alpha, beta, true));
    chess.undo();
    beta = Math.min(beta, best);
    if (beta <= alpha) {
      break;
    }
  }
  return best;
}

function localBotMove(fen: string, difficulty: ChessDifficulty): BotMove | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) {
    return null;
  }
  const botIsWhite = chess.turn() === 'w';
  const depth = LOCAL_DEPTH[difficulty];
  let bestMoves: typeof moves = [];
  let bestScore = botIsWhite ? -Infinity : Infinity;
  for (const move of moves) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
    const score = minimax(chess, depth - 1, -Infinity, Infinity, !botIsWhite);
    chess.undo();
    if (botIsWhite ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }
  const pick = bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? moves[0];
  return { from: pick.from, to: pick.to, promotion: pick.promotion };
}

/** Picks the bot's move for `fen`: medium/hard try the Stockfish Online API first (real engine strength, tuned by search depth), falling back to a small local minimax search if the network call fails or times out; easy always plays the shallow local search since it's stronger than the API allows anyway. */
export async function getBotMove(fen: string, difficulty: ChessDifficulty): Promise<BotMove | null> {
  if (difficulty !== 'easy') {
    const online = await fetchStockfishMove(fen, STOCKFISH_DEPTH[difficulty]);
    if (online) {
      return online;
    }
  }
  return localBotMove(fen, difficulty);
}

// ---- Live move quality (chess.com-style "Best/Good/Blunder…" badges) ----

export type MoveQuality = 'brilliant' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const MOVE_QUALITY_LABELS: Record<MoveQuality, string> = {
  brilliant: '💥 Parlak',
  best: '⭐ En İyi',
  good: '👍 İyi',
  inaccuracy: '🤔 Hatalı',
  mistake: '⚠️ Yanlış Hamle',
  blunder: '❌ Gaf',
};

const ANALYSIS_DEPTH = 10; // fixed regardless of bot difficulty — the point is to judge the human's move, not to match the bot's strength

interface PositionEval {
  /** Centipawn-ish score in pawns, always from White's perspective (Stockfish Online convention — confirmed by probing an asymmetric position), independent of whose turn it is. */
  evaluation: number;
  bestUci: string | null;
}

async function fetchEval(fen: string): Promise<PositionEval | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const url = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${ANALYSIS_DEPTH}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      success?: boolean;
      evaluation?: number | null;
      mate?: number | null;
      bestmove?: string;
    };
    if (!data.success) {
      return null;
    }
    const evaluation =
      typeof data.evaluation === 'number' ? data.evaluation : typeof data.mate === 'number' ? Math.sign(data.mate) * 100 : 0;
    const bestUci = data.bestmove ? data.bestmove.split(' ')[1] ?? null : null;
    return { evaluation, bestUci };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Classifies a just-played human move into one of six chess.com-style tiers by comparing
 * the engine's evaluation right before the move (best case for the mover) against the
 * evaluation right after (two Stockfish Online calls). "Brilliant" additionally requires
 * matching the engine's own top choice while sacrificing real material the opponent could
 * immediately recapture — a cheap stand-in for chess.com's much heavier brilliancy detector.
 */
export async function classifyMove(
  fenBefore: string,
  from: string,
  to: string,
  fenAfter: string,
): Promise<MoveQuality | null> {
  const moverIsWhite = fenBefore.split(' ')[1] === 'w';
  const [before, after] = await Promise.all([fetchEval(fenBefore), fetchEval(fenAfter)]);
  if (!before || !after) {
    return null;
  }

  const afterChess = new Chess(fenAfter);
  if (afterChess.isCheckmate()) {
    return 'brilliant';
  }

  const moverEvalBefore = moverIsWhite ? before.evaluation : -before.evaluation;
  const moverEvalAfter = moverIsWhite ? after.evaluation : -after.evaluation;
  const centipawnLoss = Math.round((moverEvalBefore - moverEvalAfter) * 100);

  const playedUci = `${from}${to}`;
  const matchesBest = !!before.bestUci && before.bestUci.slice(0, 4) === playedUci;

  if (matchesBest) {
    const movedPiece = new Chess(fenBefore).get(from as never);
    const sacrificeValue = movedPiece ? PIECE_VALUES[movedPiece.type] : 0;
    const recapturable = afterChess
      .moves({ verbose: true })
      .some(m => m.to === to && !!m.captured);
    if (recapturable && sacrificeValue >= 3 && moverEvalAfter >= 1) {
      return 'brilliant';
    }
    return 'best';
  }
  if (centipawnLoss <= 20) {
    return 'good';
  }
  if (centipawnLoss <= 60) {
    return 'inaccuracy';
  }
  if (centipawnLoss <= 150) {
    return 'mistake';
  }
  return 'blunder';
}
