import { ChessDifficulty } from './chessBotService';

type SquareRef = { from: string; to: string };
type BotOutcome = 'player' | 'bot' | 'draw' | null;

export type ChessSession =
  | { type: 'room'; code: string }
  | {
      type: 'bot';
      difficulty: ChessDifficulty;
      fen: string;
      lastMove: SquareRef | null;
      status: 'active' | 'finished';
      outcome: BotOutcome;
    };

/**
 * In-memory only — deliberately not persisted to AsyncStorage. It just needs
 * to outlive the ChessRoomScreen unmount that happens when GameHubScreen
 * switches `activeGame` away from chess, so a room code or bot position isn't
 * lost when the player leaves mid-game and comes back to chess later in the
 * same app session.
 */
let lastSession: ChessSession | null = null;

export function setChessSession(session: ChessSession | null): void {
  lastSession = session;
}

export function getChessSession(): ChessSession | null {
  return lastSession;
}
