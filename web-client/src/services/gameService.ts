import { Chess } from 'chess.js';
import { doc, DocumentReference, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

// ---- Tic-Tac-Toe (XOX) — mirrors the mobile app's ticTacToeService.ts ----

export type Mark = 'X' | 'O';
export type BoardCell = Mark | null;
export type GameStatus = 'active' | 'finished';
export type XoxOutcome = 'x' | 'o' | 'draw' | null;

export interface TicTacToeGame {
  board: BoardCell[];
  playerX: string;
  playerO: string;
  turnUid: string;
  status: GameStatus;
  outcome: XoxOutcome;
}

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function xoxRef(roomId: string) {
  return doc(db, 'rooms', roomId, 'game', 'ticTacToe');
}

export function winningLine(board: BoardCell[], mark: Mark): number[] | null {
  return WIN_LINES.find(line => line.every(i => board[i] === mark)) ?? null;
}

export function subscribeToXoxGame(roomId: string, onGame: (game: TicTacToeGame | null) => void): Unsubscribe {
  return onSnapshot(
    xoxRef(roomId),
    snap => {
      if (!snap.exists()) {
        onGame(null);
        return;
      }
      const data = snap.data();
      onGame({
        board: Array.isArray(data.board) ? (data.board as BoardCell[]) : Array(9).fill(null),
        playerX: typeof data.playerX === 'string' ? data.playerX : '',
        playerO: typeof data.playerO === 'string' ? data.playerO : '',
        turnUid: typeof data.turnUid === 'string' ? data.turnUid : '',
        status: data.status === 'finished' ? 'finished' : 'active',
        outcome: data.outcome === 'x' || data.outcome === 'o' || data.outcome === 'draw' ? data.outcome : null,
      });
    },
    () => onGame(null),
  );
}

export async function startXoxGame(roomId: string, myUid: string, opponentUid: string): Promise<void> {
  await setDoc(xoxRef(roomId), {
    board: Array(9).fill(null),
    playerX: myUid,
    playerO: opponentUid,
    turnUid: myUid,
    status: 'active',
    outcome: null,
    updatedAt: serverTimestamp(),
  });
}

export async function playXoxMove(roomId: string, game: TicTacToeGame, index: number, myUid: string): Promise<void> {
  if (game.status !== 'active' || game.turnUid !== myUid || game.board[index] !== null) {
    return;
  }
  const myMark: Mark = game.playerX === myUid ? 'X' : 'O';
  const nextBoard = [...game.board];
  nextBoard[index] = myMark;

  const won = winningLine(nextBoard, myMark);
  const isDraw = !won && nextBoard.every(cell => cell !== null);
  const opponentUid = myMark === 'X' ? game.playerO : game.playerX;

  await setDoc(xoxRef(roomId), {
    board: nextBoard,
    playerX: game.playerX,
    playerO: game.playerO,
    turnUid: won || isDraw ? game.turnUid : opponentUid,
    status: won || isDraw ? 'finished' : 'active',
    outcome: won ? (myMark === 'X' ? 'x' : 'o') : isDraw ? 'draw' : null,
    updatedAt: serverTimestamp(),
  });
}

// ---- Chess (contact mode) — mirrors the mobile app's chessService.ts ----

export type ChessOutcome = 'white' | 'black' | 'draw' | null;
export type ChessStatus = 'waiting' | 'active' | 'finished';

export interface ChessGame {
  fen: string;
  playerWhite: string;
  playerBlack: string;
  status: ChessStatus;
  outcome: ChessOutcome;
}

export const START_FEN = new Chess().fen();

function chessRef(roomId: string): DocumentReference {
  return doc(db, 'rooms', roomId, 'game', 'chess');
}

function parseChessGame(data: Record<string, unknown>): ChessGame {
  return {
    fen: typeof data.fen === 'string' ? data.fen : START_FEN,
    playerWhite: typeof data.playerWhite === 'string' ? data.playerWhite : '',
    playerBlack: typeof data.playerBlack === 'string' ? data.playerBlack : '',
    status: data.status === 'waiting' || data.status === 'finished' ? data.status : 'active',
    outcome: data.outcome === 'white' || data.outcome === 'black' || data.outcome === 'draw' ? data.outcome : null,
  };
}

export function subscribeToChessGame(roomId: string, onGame: (game: ChessGame | null) => void): Unsubscribe {
  return onSnapshot(
    chessRef(roomId),
    snap => onGame(snap.exists() ? parseChessGame(snap.data()) : null),
    () => onGame(null),
  );
}

export async function startChessGame(roomId: string, myUid: string, opponentUid: string): Promise<void> {
  await setDoc(chessRef(roomId), {
    fen: START_FEN,
    playerWhite: myUid,
    playerBlack: opponentUid,
    status: 'active',
    outcome: null,
    updatedAt: serverTimestamp(),
  });
}

async function applyChessMove(
  ref: DocumentReference,
  game: ChessGame,
  from: string,
  to: string,
  myUid: string,
  promotion: string,
): Promise<void> {
  if (game.status !== 'active') return;
  const isWhite = game.playerWhite === myUid;
  const chess = new Chess(game.fen);
  if ((chess.turn() === 'w') !== isWhite) return;
  try {
    chess.move({ from, to, promotion });
  } catch {
    return;
  }
  let outcome: ChessOutcome = null;
  if (chess.isCheckmate()) outcome = isWhite ? 'white' : 'black';
  else if (chess.isDraw() || chess.isStalemate()) outcome = 'draw';

  await setDoc(
    ref,
    { fen: chess.fen(), status: chess.isGameOver() ? 'finished' : 'active', outcome, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function playChessMove(
  roomId: string,
  game: ChessGame,
  from: string,
  to: string,
  myUid: string,
  promotion = 'q',
): Promise<void> {
  await applyChessMove(chessRef(roomId), game, from, to, myUid, promotion);
}

// ---- Room-code chess: chessRooms/{code}, joinable by anyone with the code — mirrors the mobile app's chessService.ts room-code mode. ----

const CHESS_ROOMS_COLLECTION = 'chessRooms';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}
function roomRef(code: string): DocumentReference {
  return doc(db, CHESS_ROOMS_COLLECTION, code.toUpperCase());
}

export function subscribeToChessRoom(code: string, onGame: (game: ChessGame | null) => void): Unsubscribe {
  return onSnapshot(
    roomRef(code),
    snap => onGame(snap.exists() ? parseChessGame(snap.data()) : null),
    () => onGame(null),
  );
}

export async function createChessRoom(myUid: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateRoomCode();
    const ref = roomRef(code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    await setDoc(ref, {
      fen: START_FEN, playerWhite: myUid, playerBlack: '', status: 'waiting', outcome: null, updatedAt: serverTimestamp(),
    });
    return code;
  }
  throw new Error('Oda kodu oluşturulamadı, tekrar dene.');
}

export type JoinChessRoomResult = 'joined' | 'not_found' | 'full' | 'own_room';

export async function joinChessRoom(code: string, myUid: string): Promise<JoinChessRoomResult> {
  const ref = roomRef(code);
  return runTransaction(db, async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return 'not_found';
    const game = parseChessGame(snap.data());
    if (game.playerWhite === myUid) return 'own_room';
    if (game.status !== 'waiting' || game.playerBlack) return 'full';
    transaction.update(ref, { playerBlack: myUid, status: 'active', updatedAt: serverTimestamp() });
    return 'joined';
  });
}

export async function restartChessRoom(code: string, game: ChessGame): Promise<void> {
  await setDoc(roomRef(code), {
    fen: START_FEN, playerWhite: game.playerWhite, playerBlack: game.playerBlack, status: 'active', outcome: null, updatedAt: serverTimestamp(),
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
  await applyChessMove(roomRef(code), game, from, to, myUid, promotion);
}

export { Chess };
