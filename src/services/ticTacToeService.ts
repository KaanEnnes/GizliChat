import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export type Mark = 'X' | 'O';
export type BoardCell = Mark | null;
export type GameStatus = 'active' | 'finished';
export type GameOutcome = 'x' | 'o' | 'draw' | null;

export interface TicTacToeGame {
  board: BoardCell[];
  /** uid of whichever player plays X — X always moves first. */
  playerX: string;
  playerO: string;
  turnUid: string;
  status: GameStatus;
  outcome: GameOutcome;
  updatedAt: number;
}

const ROOMS_COLLECTION = 'rooms';
const GAME_SUBCOLLECTION = 'game';
// Fixed doc id: one live tic-tac-toe game per room at a time, same spirit as
// a single active call — starting a new one just overwrites the last.
const GAME_DOC_ID = 'ticTacToe';

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

function gameRef(roomId: string) {
  return doc(db, ROOMS_COLLECTION, roomId, GAME_SUBCOLLECTION, GAME_DOC_ID);
}

export function winningLine(board: BoardCell[], mark: Mark): number[] | null {
  return WIN_LINES.find(line => line.every(i => board[i] === mark)) ?? null;
}

export function subscribeToGame(roomId: string, onGame: (game: TicTacToeGame | null) => void): Unsubscribe {
  return onSnapshot(
    gameRef(roomId),
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
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : Date.now(),
      });
    },
    () => onGame(null),
  );
}

/** Starts a fresh game — the caller always plays X and moves first. Overwrites any previous game in this room. */
export async function startGame(roomId: string, myUid: string, opponentUid: string): Promise<void> {
  await setDoc(gameRef(roomId), {
    board: Array(9).fill(null),
    playerX: myUid,
    playerO: opponentUid,
    turnUid: myUid,
    status: 'active',
    outcome: null,
    updatedAt: serverTimestamp(),
  });
}

export async function playMove(roomId: string, game: TicTacToeGame, index: number, myUid: string): Promise<void> {
  if (game.status !== 'active' || game.turnUid !== myUid || game.board[index] !== null) {
    return;
  }
  const myMark: Mark = game.playerX === myUid ? 'X' : 'O';
  const nextBoard = [...game.board];
  nextBoard[index] = myMark;

  const won = winningLine(nextBoard, myMark);
  const isDraw = !won && nextBoard.every(cell => cell !== null);
  const opponentUid = myMark === 'X' ? game.playerO : game.playerX;

  await setDoc(gameRef(roomId), {
    board: nextBoard,
    playerX: game.playerX,
    playerO: game.playerO,
    turnUid: won || isDraw ? game.turnUid : opponentUid,
    status: won || isDraw ? 'finished' : 'active',
    outcome: won ? (myMark === 'X' ? 'x' : 'o') : isDraw ? 'draw' : null,
    updatedAt: serverTimestamp(),
  });
}
