import React, { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import {
  playChessMove,
  playXoxMove,
  startChessGame,
  startXoxGame,
  subscribeToChessGame,
  subscribeToXoxGame,
  winningLine,
  type ChessGame,
  type TicTacToeGame,
} from '../services/gameService';
import ChessBoardView from './ChessBoardView';

type GameKind = 'picker' | 'xox' | 'chess';

interface Props {
  roomId: string;
  myUid: string;
  contactUid: string;
  contactName: string;
  onClose: () => void;
}

function GamesModal({ roomId, myUid, contactUid, contactName, onClose }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [kind, setKind] = useState<GameKind>('picker');
  const [xoxGame, setXoxGame] = useState<TicTacToeGame | null>(null);
  const [chessGame, setChessGame] = useState<ChessGame | null>(null);

  useEffect(() => subscribeToXoxGame(roomId, setXoxGame), [roomId]);
  useEffect(() => subscribeToChessGame(roomId, setChessGame), [roomId]);

  const closeAll = () => onClose();

  return (
    <div className="modal-overlay" style={{ background: theme.overlay }} onClick={closeAll}>
      <div
        className="games-modal-card"
        style={{ background: theme.surface, borderColor: theme.border, maxWidth: kind === 'chess' ? 780 : undefined }}
        onClick={e => e.stopPropagation()}>
        {kind === 'picker' && (
          <>
            <div className="modal-header-row">
              <span className="modal-title-inline" style={{ color: theme.text }}>Oyun — {contactName}</span>
              <button className="modal-close-btn" style={{ color: theme.textMuted }} onClick={closeAll}>✕</button>
            </div>
            <button className="picker-btn" style={{ background: theme.surfaceAlt, color: theme.text, borderColor: theme.border }} onClick={() => setKind('xox')}>
              ❌⭕ XOX
            </button>
            <button className="picker-btn" style={{ background: theme.surfaceAlt, color: theme.text, borderColor: theme.border }} onClick={() => setKind('chess')}>
              ♟️ Satranç
            </button>
          </>
        )}

        {kind === 'xox' && (
          <XoxView
            game={xoxGame}
            myUid={myUid}
            contactName={contactName}
            onBack={() => setKind('picker')}
            onClose={closeAll}
            onMove={index => xoxGame && playXoxMove(roomId, xoxGame, index, myUid)}
            onStart={() => startXoxGame(roomId, myUid, contactUid)}
          />
        )}

        {kind === 'chess' && (
          <ChessView
            game={chessGame}
            myUid={myUid}
            contactName={contactName}
            onBack={() => setKind('picker')}
            onClose={closeAll}
            onMove={(from, to) => chessGame && playChessMove(roomId, chessGame, from, to, myUid)}
            onStart={() => startChessGame(roomId, myUid, contactUid)}
          />
        )}
      </div>
    </div>
  );
}

function XoxView({
  game, myUid, contactName, onBack, onClose, onMove, onStart,
}: {
  game: TicTacToeGame | null;
  myUid: string;
  contactName: string;
  onBack: () => void;
  onClose: () => void;
  onMove: (index: number) => void;
  onStart: () => void;
}): React.JSX.Element {
  const { theme } = useTheme();
  const myMark = game && game.playerX === myUid ? 'X' : game && game.playerO === myUid ? 'O' : null;
  const isMyTurn = !!game && game.status === 'active' && game.turnUid === myUid;
  const winLine = game && game.status === 'finished' && game.outcome && game.outcome !== 'draw'
    ? winningLine(game.board, game.outcome === 'x' ? 'X' : 'O')
    : null;

  let statusText: string;
  if (!game || game.status === 'finished') {
    statusText = game
      ? game.outcome === 'draw'
        ? 'Berabere'
        : (game.outcome === 'x' && myMark === 'X') || (game.outcome === 'o' && myMark === 'O')
        ? 'Kazandın! 🎉'
        : `${contactName} kazandı`
      : `${contactName} ile yeni bir oyun başlat`;
  } else {
    statusText = isMyTurn ? 'Sırası sende' : `Sırası ${contactName}'da`;
  }

  return (
    <>
      <div className="modal-header-row">
        <span className="modal-title-inline" style={{ color: theme.text }}>
          <span onClick={onBack} style={{ cursor: 'pointer', marginRight: 8 }}>‹</span>
          XOX — {contactName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="modal-close-btn" style={{ color: theme.textMuted }} onClick={onStart} title="Oyunu sıfırla — her iki taraf da sıfırlayabilir">🔄</button>
          <button className="modal-close-btn" style={{ color: theme.textMuted }} onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="game-status" style={{ color: theme.textMuted }}>{statusText}</div>
      <div className="xox-board" style={{ borderColor: theme.border }}>
        {[0, 1, 2].map(row => (
          <div key={row} className="xox-row">
            {[0, 1, 2].map(col => {
              const i = row * 3 + col;
              const cell = game ? game.board[i] : null;
              const isWin = winLine?.includes(i);
              return (
                <div
                  key={i}
                  className="xox-cell"
                  style={{
                    borderColor: theme.border,
                    background: isWin ? 'rgba(217,84,0,0.15)' : theme.surface,
                    color: cell === 'X' ? theme.identity : '#D95400',
                  }}
                  onClick={() => onMove(i)}>
                  {cell || ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {(!game || game.status === 'finished') && (
        <button className="modal-start-btn" style={{ background: theme.accent, color: theme.accentText }} onClick={onStart}>
          {game ? 'YENİDEN OYNA' : 'OYUNU BAŞLAT'}
        </button>
      )}
    </>
  );
}

function ChessView({
  game, myUid, contactName, onBack, onClose, onMove, onStart,
}: {
  game: ChessGame | null;
  myUid: string;
  contactName: string;
  onBack: () => void;
  onClose: () => void;
  onMove: (from: string, to: string) => void;
  onStart: () => void;
}): React.JSX.Element {
  const { theme } = useTheme();
  const myColor = game ? (game.playerWhite === myUid ? 'w' : game.playerBlack === myUid ? 'b' : null) : null;
  const fen = game ? game.fen : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const isMyTurn = !!game && game.status === 'active' && !!myColor && fen.split(' ')[1] === myColor;

  let statusText: string;
  if (!game || game.status === 'finished') {
    statusText = game
      ? game.outcome === 'draw'
        ? 'Berabere'
        : (game.outcome === 'white' && myColor === 'w') || (game.outcome === 'black' && myColor === 'b')
        ? 'Kazandın! 🎉'
        : `${contactName} kazandı`
      : `${contactName} ile yeni bir oyun başlat`;
  } else {
    statusText = isMyTurn ? 'Sırası sende' : `Sırası ${contactName}'da`;
  }

  return (
    <>
      <div className="modal-header-row">
        <span className="modal-title-inline" style={{ color: theme.text }}>
          <span onClick={onBack} style={{ cursor: 'pointer', marginRight: 8 }}>‹</span>
          Satranç — {contactName}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="modal-close-btn" style={{ color: theme.textMuted }} onClick={onStart} title="Oyunu sıfırla — her iki taraf da sıfırlayabilir">🔄</button>
          <button className="modal-close-btn" style={{ color: theme.textMuted }} onClick={onClose}>✕</button>
        </div>
      </div>
      <div className="game-status" style={{ color: theme.textMuted }}>{statusText}</div>
      <ChessBoardView fen={fen} myColor={myColor} isMyTurn={isMyTurn} onMove={onMove} />
      {(!game || game.status === 'finished') && (
        <button className="modal-start-btn" style={{ background: theme.accent, color: theme.accentText }} onClick={onStart}>
          {game ? 'YENİDEN OYNA' : 'OYUNU BAŞLAT'}
        </button>
      )}
    </>
  );
}

export default GamesModal;
