import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import { ensureAnonymousAuth } from '../services/firebase';
import ChessBoardView from '../components/ChessBoardView';
import {
  Chess,
  createChessRoom,
  joinChessRoom,
  playRoomChessMove,
  restartChessRoom,
  START_FEN,
  subscribeToChessRoom,
  type ChessGame,
} from '../services/gameService';
import { BOT_DIFFICULTY_LABELS, getBotMove, type ChessDifficulty } from '../services/chessBotService';
import { submitScore } from '../services/leaderboardService';
import { getSavedPlayerName } from '../services/playerNameStorage';

interface Props {
  onBack: () => void;
}

type Stage = 'menu' | 'in_room' | 'bot_difficulty' | 'vs_bot';
type BotOutcome = 'player' | 'bot' | 'draw' | null;

const BOT_DIFFICULTIES: ChessDifficulty[] = ['easy', 'medium', 'hard'];

function ChessRoomScreen({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [stage, setStage] = useState<Stage>('menu');
  const [myUid, setMyUid] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [joinCodeDraft, setJoinCodeDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<ChessGame | null>(null);
  const gameUnsubRef = useRef<(() => void) | null>(null);

  const [botDifficulty, setBotDifficulty] = useState<ChessDifficulty | null>(null);
  const [botFen, setBotFen] = useState(START_FEN);
  const [botStatus, setBotStatus] = useState<'active' | 'finished'>('active');
  const [botOutcome, setBotOutcome] = useState<BotOutcome>(null);
  const [botThinking, setBotThinking] = useState(false);
  const botMoveSeqRef = useRef(0);
  const botWinsRef = useRef(0);
  const botScoreSubmittedRef = useRef(false);

  useEffect(() => () => gameUnsubRef.current?.(), []);

  const ensureAuth = useCallback(async (): Promise<string> => {
    if (myUid) return myUid;
    const user = await ensureAnonymousAuth();
    setMyUid(user.uid);
    return user.uid;
  }, [myUid]);

  const watchRoom = useCallback((roomCode: string) => {
    gameUnsubRef.current?.();
    gameUnsubRef.current = subscribeToChessRoom(roomCode, setGame);
  }, []);

  const handleCreateRoom = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const uid = await ensureAuth();
      const newCode = await createChessRoom(uid);
      setCode(newCode);
      watchRoom(newCode);
      setStage('in_room');
    } catch (err) {
      setError(`Oda kurulamadı: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [ensureAuth, watchRoom]);

  const handleJoinRoom = useCallback(async () => {
    const trimmed = joinCodeDraft.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const uid = await ensureAuth();
      const result = await joinChessRoom(trimmed, uid);
      if (result === 'not_found') {
        setError('Bu kodla bir oda bulunamadı.');
        return;
      }
      if (result === 'full') {
        setError('Bu oda dolu.');
        return;
      }
      setCode(trimmed.toUpperCase());
      watchRoom(trimmed.toUpperCase());
      setStage('in_room');
    } catch (err) {
      setError(`Katılamadı: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [ensureAuth, joinCodeDraft, watchRoom]);

  const handleMove = useCallback(
    (from: string, to: string) => {
      if (!code || !game || !myUid) return;
      playRoomChessMove(code, game, from, to, myUid).catch(() => undefined);
    },
    [code, game, myUid],
  );

  const handleRestart = useCallback(() => {
    if (!code || !game) return;
    restartChessRoom(code, game).catch(() => undefined);
  }, [code, game]);

  const handleLeave = useCallback(() => {
    gameUnsubRef.current?.();
    gameUnsubRef.current = null;
    botMoveSeqRef.current += 1;
    setStage('menu');
    setCode(null);
    setGame(null);
    setError(null);
    setBotDifficulty(null);
  }, []);

  const startBotGame = useCallback((difficulty: ChessDifficulty) => {
    botMoveSeqRef.current += 1;
    botScoreSubmittedRef.current = false;
    setBotDifficulty(difficulty);
    setBotFen(START_FEN);
    setBotStatus('active');
    setBotOutcome(null);
    setBotThinking(false);
    setStage('vs_bot');
  }, []);

  const requestBotReply = useCallback((fen: string) => {
    const seq = ++botMoveSeqRef.current;
    setBotThinking(true);
    getBotMove(fen, botDifficulty ?? 'medium')
      .then(move => {
        if (seq !== botMoveSeqRef.current || !move) return;
        const chess = new Chess(fen);
        try {
          chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
        } catch {
          return;
        }
        setBotFen(chess.fen());
        if (chess.isCheckmate()) {
          setBotStatus('finished');
          setBotOutcome('bot');
        } else if (chess.isGameOver()) {
          setBotStatus('finished');
          setBotOutcome('draw');
        }
      })
      .finally(() => {
        if (seq === botMoveSeqRef.current) setBotThinking(false);
      });
  }, [botDifficulty]);

  const handleBotMove = useCallback(
    (from: string, to: string) => {
      if (botStatus !== 'active' || botThinking) return;
      const chess = new Chess(botFen);
      if (chess.turn() !== 'w') return;
      try {
        chess.move({ from, to, promotion: 'q' });
      } catch {
        return;
      }
      const nextFen = chess.fen();
      setBotFen(nextFen);

      if (chess.isCheckmate()) {
        setBotStatus('finished');
        setBotOutcome('player');
        return;
      }
      if (chess.isGameOver()) {
        setBotStatus('finished');
        setBotOutcome('draw');
        return;
      }
      requestBotReply(nextFen);
    },
    [botFen, botStatus, botThinking, requestBotReply],
  );

  const handleBotRestart = useCallback(() => {
    if (!botDifficulty) return;
    startBotGame(botDifficulty);
  }, [botDifficulty, startBotGame]);

  useEffect(() => {
    if (stage !== 'vs_bot' || botStatus !== 'finished' || botScoreSubmittedRef.current) return;
    botScoreSubmittedRef.current = true;
    if (botOutcome === 'player') {
      botWinsRef.current += 1;
      submitScore(getSavedPlayerName() || 'Oyuncu', botWinsRef.current, 'chessVsBot').catch(() => undefined);
    }
  }, [stage, botStatus, botOutcome]);

  const myColor: 'w' | 'b' | null =
    game && myUid ? (game.playerWhite === myUid ? 'w' : game.playerBlack === myUid ? 'b' : null) : null;
  const isMyTurn = !!game && game.status === 'active' && !!myColor && game.fen.split(' ')[1] === myColor;

  let statusText = '';
  if (game) {
    if (game.status === 'waiting') statusText = 'Rakip bekleniyor…';
    else if (game.status === 'finished') {
      statusText = game.outcome === 'draw' ? 'Berabere' : (game.outcome === 'white' && myColor === 'w') || (game.outcome === 'black' && myColor === 'b') ? 'Kazandın! 🎉' : 'Kaybettin';
    } else statusText = isMyTurn ? 'Sırası sende' : 'Rakibin sırası';
  }

  return (
    <div className="game-screen" style={{ background: theme.background }}>
      <div className="game-header">
        <span
          className="game-menu-link"
          style={{ color: theme.textMuted }}
          onClick={stage === 'in_room' || stage === 'vs_bot' ? handleLeave : stage === 'bot_difficulty' ? () => setStage('menu') : onBack}>
          ‹ Menü
        </span>
        <span className="game-title" style={{ color: theme.text, fontSize: 16 }}>SATRANÇ</span>
        <div className="game-header-right" />
      </div>

      {error && <div style={{ color: theme.danger, fontSize: 13, fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>{error}</div>}

      {stage === 'menu' && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
            Bir oda kur ve kodu paylaş, ya da sana verilen kodla bir odaya katıl.
          </div>
          <button className="game-restart-btn" style={{ width: '100%', background: theme.accent, color: theme.accentText, opacity: busy ? 0.6 : 1 }} onClick={handleCreateRoom} disabled={busy}>
            {busy ? '...' : 'ODA KUR'}
          </button>
          <div style={{ margin: '18px 0', fontSize: 12, fontWeight: 600, color: theme.textFaint }}>veya</div>
          <input
            className="modal-input"
            style={{ width: '100%', background: theme.inputBackground, color: theme.text, borderColor: theme.border, textAlign: 'center', letterSpacing: 4, fontWeight: 700 }}
            value={joinCodeDraft}
            onChange={e => setJoinCodeDraft(e.target.value.toUpperCase())}
            placeholder="Oda kodu"
            maxLength={5}
          />
          <button
            className="picker-btn"
            style={{ background: theme.surfaceAlt, color: theme.text, borderColor: theme.border, opacity: busy || !joinCodeDraft.trim() ? 0.5 : 1 }}
            onClick={handleJoinRoom}
            disabled={busy || !joinCodeDraft.trim()}>
            ODAYA KATIL
          </button>
          <div style={{ margin: '18px 0', fontSize: 12, fontWeight: 600, color: theme.textFaint }}>veya</div>
          <button className="picker-btn" style={{ background: theme.surfaceAlt, color: theme.text, borderColor: theme.border }} onClick={() => setStage('bot_difficulty')}>
            BİLGİSAYARA KARŞI OYNA
          </button>
        </div>
      )}

      {stage === 'bot_difficulty' && (
        <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 24 }}>Zorluk seviyesi seç.</div>
          {BOT_DIFFICULTIES.map(level => (
            <button key={level} className="picker-btn" style={{ background: theme.surfaceAlt, color: theme.text, borderColor: theme.border }} onClick={() => startBotGame(level)}>
              {BOT_DIFFICULTY_LABELS[level].toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {stage === 'vs_bot' && botDifficulty && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ background: theme.surface, borderColor: theme.border, borderWidth: 1, borderStyle: 'solid', borderRadius: 14, padding: '8px 20px', marginBottom: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.textFaint, letterSpacing: 0.5 }}>BİLGİSAYAR</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>{BOT_DIFFICULTY_LABELS[botDifficulty].toUpperCase()}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, marginBottom: 10 }}>
            {botStatus === 'finished'
              ? botOutcome === 'draw' ? 'Berabere' : botOutcome === 'player' ? 'Kazandın! 🎉' : 'Bilgisayar kazandı'
              : botThinking ? 'Bilgisayar düşünüyor…' : 'Sırası sende'}
          </div>
          <ChessBoardView fen={botFen} myColor="w" isMyTurn={botStatus === 'active' && !botThinking} onMove={handleBotMove} />
          {botStatus === 'finished' && (
            <button className="game-restart-btn" style={{ marginTop: 16, background: theme.accent, color: theme.accentText }} onClick={handleBotRestart}>
              YENİDEN OYNA
            </button>
          )}
        </div>
      )}

      {stage === 'in_room' && code && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{ background: theme.surface, borderColor: theme.border, borderWidth: 1, borderStyle: 'solid', borderRadius: 14, padding: '8px 20px', marginBottom: 10, textAlign: 'center', cursor: 'pointer' }}
            onClick={() => navigator.clipboard?.writeText(code).catch(() => undefined)}>
            <div style={{ fontSize: 10, fontWeight: 700, color: theme.textFaint, letterSpacing: 0.5 }}>ODA KODU · kopyalamak için dokun</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text, letterSpacing: 6 }}>{code}</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.textMuted, marginBottom: 10 }}>{statusText}</div>
          {game?.status === 'waiting' ? (
            <div style={{ marginTop: 40, color: theme.textMuted, fontSize: 13 }}>Bağlanıyor…</div>
          ) : (
            <ChessBoardView fen={game?.fen ?? START_FEN} myColor={myColor} isMyTurn={isMyTurn} onMove={handleMove} />
          )}
          {game?.status === 'finished' && (
            <button className="game-restart-btn" style={{ marginTop: 16, background: theme.accent, color: theme.accentText }} onClick={handleRestart}>
              YENİDEN OYNA
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ChessRoomScreen;
