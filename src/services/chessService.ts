import { Chess } from 'chess.js';
import {
  doc,
  DocumentReference,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

export type ChessOutcome = 'white' | 'black' | 'draw' | null;
export type ChessStatus = 'waiting' | 'active' | 'finished';

export interface ChessGame {
  fen: string;
  playerWhite: string;
  /** Empty until a second player joins a room-code game — contact games always start with both filled. */
  playerBlack: string;
  status: ChessStatus;
  outcome: ChessOutcome;
  updatedAt: number;
}

export const START_FEN = new Chess().fen();

function parseGame(data: Record<string, unknown>): ChessGame {
  return {
    fen: typeof data.fen === 'string' ? data.fen : START_FEN,
    playerWhite: typeof data.playerWhite === 'string' ? data.playerWhite : '',
    playerBlack: typeof data.playerBlack === 'string' ? data.playerBlack : '',
    status: data.status === 'waiting' || data.status === 'finished' ? data.status : 'active',
    outcome:
      data.outcome === 'white' || data.outcome === 'black' || data.outcome === 'draw' ? data.outcome : null,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : Date.now(),
  };
}

function subscribe(ref: DocumentReference, onGame: (game: ChessGame | null) => void): Unsubscribe {
  return onSnapshot(
    ref,
    snap => onGame(snap.exists() ? parseGame(snap.data()) : null),
    () => onGame(null),
  );
}

/** Applies `from`→`to` (with optional promotion piece, defaults to queen) if it's a legal move and this player's turn. Silently no-ops otherwise — same trust model as the rest of this app's realtime games. */
async function applyMove(
  ref: DocumentReference,
  game: ChessGame,
  from: string,
  to: string,
  myUid: string,
  promotion: string,
): Promise<void> {
  if (game.status !== 'active') {
    return;
  }
  const isWhite = game.playerWhite === myUid;
  const chess = new Chess(game.fen);
  if ((chess.turn() === 'w') !== isWhite) {
    return;
  }
  try {
    chess.move({ from, to, promotion });
  } catch {
    return; // illegal move — ignore the tap rather than surface an error
  }

  let outcome: ChessOutcome = null;
  if (chess.isCheckmate()) {
    outcome = isWhite ? 'white' : 'black';
  } else if (chess.isDraw() || chess.isStalemate()) {
    outcome = 'draw';
  }

  await setDoc(
    ref,
    {
      fen: chess.fen(),
      status: chess.isGameOver() ? 'finished' : 'active',
      outcome,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// ---- Contact mode: rooms/{roomId}/game/chess, mirrors ticTacToeService ----

function contactRef(roomId: string): DocumentReference {
  return doc(db, 'rooms', roomId, 'game', 'chess');
}

export function subscribeToContactChessGame(roomId: string, onGame: (game: ChessGame | null) => void): Unsubscribe {
  return subscribe(contactRef(roomId), onGame);
}

/** Starts a fresh game — the caller always plays white. Overwrites any previous game in this room. */
export async function startContactChessGame(roomId: string, myUid: string, opponentUid: string): Promise<void> {
  await setDoc(contactRef(roomId), {
    fen: START_FEN,
    playerWhite: myUid,
    playerBlack: opponentUid,
    status: 'active',
    outcome: null,
    updatedAt: serverTimestamp(),
  });
}

export async function playContactChessMove(
  roomId: string,
  game: ChessGame,
  from: string,
  to: string,
  myUid: string,
  promotion = 'q',
): Promise<void> {
  await applyMove(contactRef(roomId), game, from, to, myUid, promotion);
}

// ---- Room-code mode: chessRooms/{code}, joinable by anyone with the code ----

const CHESS_ROOMS_COLLECTION = 'chessRooms';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to misread out loud

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function roomRef(code: string): DocumentReference {
  return doc(db, CHESS_ROOMS_COLLECTION, code.toUpperCase());
}

export function subscribeToChessRoom(code: string, onGame: (game: ChessGame | null) => void): Unsubscribe {
  return subscribe(roomRef(code), onGame);
}

/** Creates a new room, waiting for a second player. Retries once on the astronomically unlikely chance the random code already exists. */
export async function createChessRoom(myUid: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode();
    const ref = roomRef(code);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      continue;
    }
    await setDoc(ref, {
      fen: START_FEN,
      playerWhite: myUid,
      playerBlack: '',
      status: 'waiting',
      outcome: null,
      updatedAt: serverTimestamp(),
    });
    return code;
  }
  throw new Error('Oda kodu oluşturulamadı, tekrar dene.');
}

export type JoinChessRoomResult = 'joined' | 'not_found' | 'full' | 'own_room';

/** Joins an open room as black. Uses a transaction so two people tapping "join" on the same code at once can't both become black. */
export async function joinChessRoom(code: string, myUid: string): Promise<JoinChessRoomResult> {
  const ref = roomRef(code);
  return runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      return 'not_found';
    }
    const game = parseGame(snap.data());
    if (game.playerWhite === myUid) {
      return 'own_room';
    }
    if (game.status !== 'waiting' || game.playerBlack) {
      return 'full';
    }
    transaction.update(ref, { playerBlack: myUid, status: 'active', updatedAt: serverTimestamp() });
    return 'joined';
  });
}

/** Resets an existing room-code game back to the start position for a rematch, keeping the same two players. */
export async function restartChessRoom(code: string, game: ChessGame): Promise<void> {
  await setDoc(roomRef(code), {
    fen: START_FEN,
    playerWhite: game.playerWhite,
    playerBlack: game.playerBlack,
    status: 'active',
    outcome: null,
    updatedAt: serverTimestamp(),
  });
}

export async function playRoomChessMove(
  code: string,
  game: ChessGame,
  from: string,
  to: string,
  myUid: string,
  promotion = 'q',
): Promise<void> {
  await applyMove(roomRef(code), game, from, to, myUid, promotion);
}

// Re-exported so UI components can compute legal-move highlights and board
// layout without importing chess.js directly.
export { Chess };
