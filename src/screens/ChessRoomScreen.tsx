import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useWindowDimensions } from 'react-native';
import { playGameOverSound, playTapSound, playWinSound } from '../services/soundService';
import { ensureAnonymousAuth } from '../services/firebase';
import { requestBluetoothConnectPermission } from '../services/permissionsService';
import {
  BluetoothChessMove,
  connectToBluetoothChessHost,
  disconnectBluetoothChess,
  getPairedDevices,
  isBluetoothChessAvailable,
  isBluetoothEnabled,
  onBluetoothChessConnected,
  onBluetoothChessDisconnected,
  onBluetoothChessError,
  onBluetoothChessMove,
  onBluetoothChessRestart,
  PairedDevice,
  requestEnableBluetooth,
  sendBluetoothChessMove,
  sendBluetoothChessRestart,
  startBluetoothChessServer,
} from '../services/bluetoothChessBridge';
import ChessBoard from '../components/ChessBoard';
import {
  Chess,
  ChessGame,
  createChessRoom,
  joinChessRoom,
  playRoomChessMove,
  restartChessRoom,
  START_FEN,
  subscribeToChessRoom,
} from '../services/chessService';
import {
  BOT_DIFFICULTY_LABELS,
  ChessDifficulty,
  classifyMove,
  getBotMove,
  MOVE_QUALITY_LABELS,
  MoveQuality,
} from '../services/chessBotService';

interface Props {
  onBack: () => void;
}

type Stage = 'menu' | 'joining' | 'in_room' | 'bot_difficulty' | 'vs_bot' | 'bluetooth_menu' | 'vs_bluetooth';
type BluetoothOutcome = 'me' | 'opponent' | 'draw' | null;
type BotOutcome = 'player' | 'bot' | 'draw' | null;
type SquareRef = { from: string; to: string };

const BOT_DIFFICULTIES: ChessDifficulty[] = ['easy', 'medium', 'hard'];

function ChessRoomScreen({ onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Fills the actual available screen instead of sitting at a small fixed
  // cap — same approach as SnakeGame's boardSize, minus the fixed chrome
  // above (header + code badge + status line) and below (turn dot) the board.
  const boardSize = Math.min(width - 24, height - insets.top - insets.bottom - 210, 560);

  const [stage, setStage] = useState<Stage>('menu');
  const [myUid, setMyUid] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [joinCodeDraft, setJoinCodeDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<ChessGame | null>(null);
  const gameUnsubRef = useRef<(() => void) | null>(null);
  const lastAnnouncedRef = useRef<number | null>(null);

  const [botDifficulty, setBotDifficulty] = useState<ChessDifficulty | null>(null);
  const [botFen, setBotFen] = useState(START_FEN);
  const [botStatus, setBotStatus] = useState<'active' | 'finished'>('active');
  const [botOutcome, setBotOutcome] = useState<BotOutcome>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [botLastMove, setBotLastMove] = useState<SquareRef | null>(null);
  const [premove, setPremove] = useState<SquareRef | null>(null);
  const [moveQuality, setMoveQuality] = useState<MoveQuality | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const botMoveSeqRef = useRef(0);
  const analysisSeqRef = useRef(0);

  const [btDevices, setBtDevices] = useState<PairedDevice[]>([]);
  const [btBusy, setBtBusy] = useState(false);
  const [btHosting, setBtHosting] = useState(false);
  const [btOpponentName, setBtOpponentName] = useState<string | null>(null);
  const [btMyColor, setBtMyColor] = useState<'w' | 'b'>('w');
  const [btFen, setBtFen] = useState(START_FEN);
  const [btStatus, setBtStatus] = useState<'active' | 'finished'>('active');
  const [btOutcome, setBtOutcome] = useState<BluetoothOutcome>(null);
  const [btLastMove, setBtLastMove] = useState<SquareRef | null>(null);
  const btConnectedRef = useRef(false);

  useEffect(() => {
    return () => {
      gameUnsubRef.current?.();
      if (btConnectedRef.current) {
        disconnectBluetoothChess().catch(() => undefined);
      }
    };
  }, []);

  // Wired up once — these fire regardless of which Bluetooth stage is
  // currently showing (e.g. the "connected" event arrives while still on
  // bluetooth_menu, right before we switch to vs_bluetooth).
  useEffect(() => {
    const offConnected = onBluetoothChessConnected(name => {
      btConnectedRef.current = true;
      setBtOpponentName(name);
      setBtFen(START_FEN);
      setBtStatus('active');
      setBtOutcome(null);
      setBtLastMove(null);
      setBtBusy(false);
      setStage('vs_bluetooth');
      playTapSound();
    });
    const offDisconnected = onBluetoothChessDisconnected(() => {
      btConnectedRef.current = false;
      setError('Bağlantı kesildi.');
    });
    const offError = onBluetoothChessError(message => {
      setBtBusy(false);
      setError(message);
    });
    const offMove = onBluetoothChessMove((move: BluetoothChessMove) => {
      setBtFen(currentFen => {
        const chess = new Chess(currentFen);
        try {
          chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
        } catch {
          return currentFen; // opponent sent something illegal/stale — ignore
        }
        setBtLastMove({ from: move.from, to: move.to });
        if (chess.isCheckmate()) {
          setBtStatus('finished');
          setBtOutcome('opponent');
        } else if (chess.isGameOver()) {
          setBtStatus('finished');
          setBtOutcome('draw');
        }
        return chess.fen();
      });
    });
    const offRestart = onBluetoothChessRestart(() => {
      setBtFen(START_FEN);
      setBtStatus('active');
      setBtOutcome(null);
      setBtLastMove(null);
    });
    return () => {
      offConnected();
      offDisconnected();
      offError();
      offMove();
      offRestart();
    };
  }, []);

  const ensureAuth = useCallback(async (): Promise<string> => {
    if (myUid) {
      return myUid;
    }
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
      playTapSound();
    } catch (err) {
      setError(`Oda kurulamadı: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [ensureAuth, watchRoom]);

  const handleJoinRoom = useCallback(async () => {
    const trimmed = joinCodeDraft.trim();
    if (!trimmed) {
      return;
    }
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
      // 'own_room' just means this device already created it — rejoin it directly.
      setCode(trimmed.toUpperCase());
      watchRoom(trimmed.toUpperCase());
      setStage('in_room');
      playTapSound();
    } catch (err) {
      setError(`Katılamadı: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [ensureAuth, joinCodeDraft, watchRoom]);

  const handleMove = useCallback(
    (from: string, to: string) => {
      if (!code || !game || !myUid) {
        return;
      }
      playTapSound();
      playRoomChessMove(code, game, from, to, myUid).catch(() => undefined);
    },
    [code, game, myUid],
  );

  const handleRestart = useCallback(() => {
    if (!code || !game) {
      return;
    }
    playTapSound();
    restartChessRoom(code, game).catch(() => undefined);
  }, [code, game]);

  const handleLeave = useCallback(() => {
    gameUnsubRef.current?.();
    gameUnsubRef.current = null;
    botMoveSeqRef.current += 1; // invalidate any in-flight bot move
    analysisSeqRef.current += 1;
    setStage('menu');
    setCode(null);
    setGame(null);
    setError(null);
    setBotDifficulty(null);
  }, []);

  const startBotGame = useCallback((difficulty: ChessDifficulty) => {
    botMoveSeqRef.current += 1;
    analysisSeqRef.current += 1;
    playTapSound();
    setBotDifficulty(difficulty);
    setBotFen(START_FEN);
    setBotStatus('active');
    setBotOutcome(null);
    setBotThinking(false);
    setBotLastMove(null);
    setPremove(null);
    setMoveQuality(null);
    setAnalyzing(false);
    setStage('vs_bot');
  }, []);

  const requestBotReply = useCallback((fen: string) => {
    const seq = ++botMoveSeqRef.current;
    setBotThinking(true);
    getBotMove(fen, botDifficulty ?? 'medium')
      .then(move => {
        if (seq !== botMoveSeqRef.current || !move) {
          return;
        }
        const chess = new Chess(fen);
        try {
          chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' });
        } catch {
          return; // bot proposed something illegal (stale/edge response) — leave the board as-is
        }
        setBotFen(chess.fen());
        setBotLastMove({ from: move.from, to: move.to });
        if (chess.isCheckmate()) {
          setBotStatus('finished');
          setBotOutcome('bot');
        } else if (chess.isGameOver()) {
          setBotStatus('finished');
          setBotOutcome('draw');
        }
      })
      .finally(() => {
        if (seq === botMoveSeqRef.current) {
          setBotThinking(false);
        }
      });
  }, [botDifficulty]);

  const handleBotMove = useCallback(
    (from: string, to: string) => {
      if (botStatus !== 'active' || botThinking) {
        return;
      }
      const fenBeforeMove = botFen;
      const chess = new Chess(fenBeforeMove);
      if (chess.turn() !== 'w') {
        return;
      }
      playTapSound();
      try {
        chess.move({ from, to, promotion: 'q' });
      } catch {
        return;
      }
      const nextFen = chess.fen();
      setBotFen(nextFen);
      setBotLastMove({ from, to });
      setMoveQuality(null);

      const analysisSeq = ++analysisSeqRef.current;
      setAnalyzing(true);
      classifyMove(fenBeforeMove, from, to, nextFen)
        .then(quality => {
          if (analysisSeq === analysisSeqRef.current) {
            setMoveQuality(quality);
          }
        })
        .finally(() => {
          if (analysisSeq === analysisSeqRef.current) {
            setAnalyzing(false);
          }
        });

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

  // Auto-plays a queued premove the instant it becomes the player's turn again —
  // silently drops it if it's no longer legal against the bot's actual reply.
  useEffect(() => {
    if (!premove || botStatus !== 'active' || botThinking) {
      return;
    }
    if (new Chess(botFen).turn() !== 'w') {
      return;
    }
    const pm = premove;
    setPremove(null);
    handleBotMove(pm.from, pm.to);
  }, [premove, botStatus, botThinking, botFen, handleBotMove]);

  const handleOpenBluetoothMenu = useCallback(async () => {
    setError(null);
    if (!isBluetoothChessAvailable()) {
      setError('Bluetooth ile oynamak sadece Android\'de kullanılabilir.');
      return;
    }
    const granted = await requestBluetoothConnectPermission();
    if (!granted) {
      return;
    }
    const enabled = await isBluetoothEnabled();
    if (!enabled) {
      setError('Bluetooth kapalı — açıp tekrar dene.');
      requestEnableBluetooth().catch(() => undefined);
      return;
    }
    const devices = await getPairedDevices().catch(() => []);
    setBtDevices(devices);
    setStage('bluetooth_menu');
  }, []);

  const handleHostBluetooth = useCallback(async () => {
    setBtBusy(true);
    setError(null);
    setBtMyColor('w');
    setBtHosting(true);
    playTapSound();
    try {
      await startBluetoothChessServer();
      // Stays busy/waiting until the "connected" event fires (see the
      // effect above) — startServer() itself only confirms listening began.
    } catch (err) {
      setBtBusy(false);
      setBtHosting(false);
      setError(`Başlatılamadı: ${(err as Error).message}`);
    }
  }, []);

  const handleConnectBluetooth = useCallback(async (device: PairedDevice) => {
    setBtBusy(true);
    setError(null);
    setBtMyColor('b');
    setBtHosting(false);
    playTapSound();
    try {
      await connectToBluetoothChessHost(device.address);
    } catch (err) {
      setBtBusy(false);
      setError(`Bağlanılamadı: ${(err as Error).message}`);
    }
  }, []);

  const handleLeaveBluetooth = useCallback(() => {
    btConnectedRef.current = false;
    disconnectBluetoothChess().catch(() => undefined);
    setBtBusy(false);
    setBtHosting(false);
    setBtOpponentName(null);
    setError(null);
    setStage('menu');
  }, []);

  const handleBluetoothMove = useCallback(
    (from: string, to: string) => {
      if (btStatus !== 'active') {
        return;
      }
      const isMyTurn = new Chess(btFen).turn() === btMyColor;
      if (!isMyTurn) {
        return;
      }
      const chess = new Chess(btFen);
      try {
        chess.move({ from, to, promotion: 'q' });
      } catch {
        return;
      }
      playTapSound();
      setBtFen(chess.fen());
      setBtLastMove({ from, to });
      sendBluetoothChessMove({ from, to, promotion: 'q' }).catch(() => undefined);
      if (chess.isCheckmate()) {
        setBtStatus('finished');
        setBtOutcome('me');
      } else if (chess.isGameOver()) {
        setBtStatus('finished');
        setBtOutcome('draw');
      }
    },
    [btFen, btMyColor, btStatus],
  );

  const handleBluetoothRestart = useCallback(() => {
    playTapSound();
    setBtFen(START_FEN);
    setBtStatus('active');
    setBtOutcome(null);
    setBtLastMove(null);
    sendBluetoothChessRestart().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (stage !== 'vs_bluetooth' || btStatus !== 'finished') {
      return;
    }
    if (btOutcome === 'me') {
      playWinSound();
    } else {
      playGameOverSound();
    }
  }, [stage, btStatus, btOutcome]);

  const handleBotRestart = useCallback(() => {
    if (!botDifficulty) {
      return;
    }
    startBotGame(botDifficulty);
  }, [botDifficulty, startBotGame]);

  useEffect(() => {
    if (stage !== 'vs_bot' || botStatus !== 'finished') {
      return;
    }
    if (botOutcome === 'player') {
      playWinSound();
    } else {
      playGameOverSound();
    }
  }, [stage, botStatus, botOutcome]);

  const myColor: 'w' | 'b' | null =
    game && myUid ? (game.playerWhite === myUid ? 'w' : game.playerBlack === myUid ? 'b' : null) : null;
  const isMyTurn = !!game && game.status === 'active' && !!myColor && game.fen.split(' ')[1] === myColor;

  useEffect(() => {
    if (!game || game.status !== 'finished' || lastAnnouncedRef.current === game.updatedAt) {
      return;
    }
    lastAnnouncedRef.current = game.updatedAt;
    const iWon = (game.outcome === 'white' && myColor === 'w') || (game.outcome === 'black' && myColor === 'b');
    if (iWon) {
      playWinSound();
    } else {
      playGameOverSound();
    }
  }, [game, myColor]);

  let statusText = '';
  if (game) {
    if (game.status === 'waiting') {
      statusText = 'Rakip bekleniyor…';
    } else if (game.status === 'finished') {
      statusText =
        game.outcome === 'draw' ? 'Berabere' : (game.outcome === 'white' && myColor === 'w') || (game.outcome === 'black' && myColor === 'b') ? 'Kazandın! 🎉' : 'Kaybettin';
    } else if (isMyTurn) {
      statusText = 'Sırası sende';
    } else {
      statusText = 'Rakibin sırası';
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={
            stage === 'in_room' || stage === 'vs_bot'
              ? handleLeave
              : stage === 'vs_bluetooth'
              ? handleLeaveBluetooth
              : stage === 'bluetooth_menu'
              ? () => {
                  disconnectBluetoothChess().catch(() => undefined);
                  setBtBusy(false);
                  setBtHosting(false);
                  setStage('menu');
                }
              : stage === 'bot_difficulty'
              ? () => setStage('menu')
              : onBack
          }
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Oyunlara dön">
          <Text style={[styles.menuLink, { color: theme.textMuted }]}>‹ Menü</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>SATRANÇ</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}

      {stage === 'menu' && (
        <View style={styles.menuBody}>
          <Text style={[styles.menuHint, { color: theme.textMuted }]}>
            Bir oda kur ve kodu paylaş, ya da sana verilen kodla bir odaya katıl.
          </Text>
          <Pressable
            onPress={handleCreateRoom}
            disabled={busy}
            style={[styles.primaryButton, { backgroundColor: theme.accent }, busy && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Oda kur">
            {busy ? <ActivityIndicator color={theme.accentText} /> : (
              <Text style={[styles.primaryButtonText, { color: theme.accentText }]}>ODA KUR</Text>
            )}
          </Pressable>

          <Text style={[styles.orText, { color: theme.textFaint }]}>veya</Text>

          <TextInput
            value={joinCodeDraft}
            onChangeText={t => setJoinCodeDraft(t.toUpperCase())}
            placeholder="Oda kodu"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="characters"
            maxLength={5}
            style={[
              styles.codeInput,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.inputBackground },
            ]}
          />
          <Pressable
            onPress={handleJoinRoom}
            disabled={busy || !joinCodeDraft.trim()}
            style={[
              styles.secondaryButton,
              { borderColor: theme.border },
              (busy || !joinCodeDraft.trim()) && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Odaya katıl">
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>ODAYA KATIL</Text>
          </Pressable>

          <Text style={[styles.orText, { color: theme.textFaint }]}>veya</Text>

          <Pressable
            onPress={() => setStage('bot_difficulty')}
            style={[styles.secondaryButton, { borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel="Bilgisayara karşı oyna">
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>BİLGİSAYARA KARŞI OYNA</Text>
          </Pressable>

          <Text style={[styles.orText, { color: theme.textFaint }]}>veya</Text>

          <Pressable
            onPress={handleOpenBluetoothMenu}
            style={[styles.secondaryButton, { borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel="Bluetooth ile yakındaki cihazla oyna">
            <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
              BLUETOOTH İLE YAKINDAKİ CİHAZLA OYNA
            </Text>
          </Pressable>
        </View>
      )}

      {stage === 'bluetooth_menu' && (
        <View style={styles.menuBody}>
          <Text style={[styles.menuHint, { color: theme.textMuted }]}>
            İnternet gerekmez — önce iki telefonu Telefon Ayarları'ndan Bluetooth ile eşleştir, sonra biri "Ev sahibi
            ol"a bassın, diğeri eşleştirilmiş cihaz listesinden onu seçsin.
          </Text>

          <Pressable
            onPress={handleHostBluetooth}
            disabled={btBusy}
            style={[styles.primaryButton, { backgroundColor: theme.accent }, btBusy && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel="Ev sahibi ol">
            {btBusy && btHosting ? (
              <ActivityIndicator color={theme.accentText} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: theme.accentText }]}>
                {btBusy && btHosting ? 'BEKLENİYOR…' : 'EV SAHİBİ OL (BEKLE)'}
              </Text>
            )}
          </Pressable>

          <Text style={[styles.orText, { color: theme.textFaint }]}>veya eşleştirilmiş bir cihaza bağlan</Text>

          {btDevices.length === 0 ? (
            <Text style={[styles.menuHint, { color: theme.textFaint }]}>
              Eşleştirilmiş cihaz yok. Önce telefon Bluetooth ayarlarından diğer telefonla eşleştir.
            </Text>
          ) : (
            btDevices.map(device => (
              <Pressable
                key={device.address}
                onPress={() => handleConnectBluetooth(device)}
                disabled={btBusy}
                style={[
                  styles.secondaryButton,
                  styles.difficultyButton,
                  { borderColor: theme.border },
                  btBusy && styles.disabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${device.name} cihazına bağlan`}>
                <Text style={[styles.secondaryButtonText, { color: theme.text }]} numberOfLines={1}>
                  {btBusy && !btHosting ? 'BAĞLANIYOR…' : device.name.toUpperCase()}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      {stage === 'vs_bluetooth' && (
        <View style={styles.roomBody}>
          <View style={styles.roomTop}>
            <View style={[styles.codeBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.codeBadgeLabel, { color: theme.textFaint }]}>BLUETOOTH</Text>
              <Text style={[styles.codeBadgeValue, { color: theme.text }]} numberOfLines={1}>
                {btOpponentName ?? 'Rakip'}
              </Text>
            </View>

            <View style={styles.statusRow}>
              {btStatus === 'active' && (
                <View
                  style={[
                    styles.turnDot,
                    { backgroundColor: new Chess(btFen).turn() === btMyColor ? theme.accent : theme.textFaint },
                  ]}
                />
              )}
              <Text style={[styles.status, { color: theme.textMuted }]}>
                {btStatus === 'finished'
                  ? btOutcome === 'draw'
                    ? 'Berabere'
                    : btOutcome === 'me'
                    ? 'Kazandın! 🎉'
                    : 'Rakip kazandı'
                  : new Chess(btFen).turn() === btMyColor
                  ? 'Sırası sende'
                  : 'Rakibin sırası'}
              </Text>
            </View>
          </View>

          <View style={styles.boardWrap}>
            <ChessBoard
              fen={btFen}
              myColor={btMyColor}
              isMyTurn={btStatus === 'active' && new Chess(btFen).turn() === btMyColor}
              onMove={handleBluetoothMove}
              size={boardSize}
              lastMove={btLastMove}
            />
          </View>

          <View style={styles.roomBottom}>
            {btStatus === 'finished' && (
              <Pressable
                onPress={handleBluetoothRestart}
                style={[styles.primaryButton, styles.restartButton, { backgroundColor: theme.accent }]}
                accessibilityRole="button"
                accessibilityLabel="Yeniden oyna">
                <Text style={[styles.primaryButtonText, { color: theme.accentText }]}>YENİDEN OYNA</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {stage === 'bot_difficulty' && (
        <View style={styles.menuBody}>
          <Text style={[styles.menuHint, { color: theme.textMuted }]}>Zorluk seviyesi seç.</Text>
          {BOT_DIFFICULTIES.map(level => (
            <Pressable
              key={level}
              onPress={() => startBotGame(level)}
              style={[styles.secondaryButton, styles.difficultyButton, { borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel={BOT_DIFFICULTY_LABELS[level]}>
              <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                {BOT_DIFFICULTY_LABELS[level].toUpperCase()}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {stage === 'vs_bot' && botDifficulty && (
        <View style={styles.roomBody}>
          <View style={styles.roomTop}>
            <View style={[styles.codeBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.codeBadgeLabel, { color: theme.textFaint }]}>BİLGİSAYAR</Text>
              <Text style={[styles.codeBadgeValue, { color: theme.text }]}>
                {BOT_DIFFICULTY_LABELS[botDifficulty].toUpperCase()}
              </Text>
            </View>

            <View style={styles.statusRow}>
              {botStatus === 'active' && (
                <View
                  style={[
                    styles.turnDot,
                    { backgroundColor: !botThinking ? theme.accent : theme.textFaint },
                  ]}
                />
              )}
              <Text style={[styles.status, { color: theme.textMuted }]}>
                {botStatus === 'finished'
                  ? botOutcome === 'draw'
                    ? 'Berabere'
                    : botOutcome === 'player'
                    ? 'Kazandın! 🎉'
                    : 'Bilgisayar kazandı'
                  : botThinking
                  ? 'Bilgisayar düşünüyor…'
                  : 'Sırası sende'}
              </Text>
            </View>

            {(analyzing || moveQuality) && (
              <Text style={[styles.qualityBadge, { color: theme.textMuted }]}>
                {analyzing ? 'Analiz ediliyor…' : moveQuality ? MOVE_QUALITY_LABELS[moveQuality] : ''}
              </Text>
            )}

            {premove && (
              <Pressable onPress={() => setPremove(null)} accessibilityRole="button" accessibilityLabel="Ön hamleyi iptal et">
                <Text style={[styles.premoveBadge, { color: theme.danger }]}>
                  Ön hamle: {premove.from} → {premove.to} · iptal için dokun
                </Text>
              </Pressable>
            )}
          </View>

          <View style={styles.boardWrap}>
            <ChessBoard
              fen={botFen}
              myColor="w"
              isMyTurn={botStatus === 'active' && !botThinking}
              onMove={handleBotMove}
              size={boardSize}
              lastMove={botLastMove}
              allowPremove={botStatus === 'active'}
              premove={premove}
              onSetPremove={(from, to) => setPremove({ from, to })}
              onClearPremove={() => setPremove(null)}
            />
          </View>

          <View style={styles.roomBottom}>
            {botStatus === 'finished' && (
              <Pressable
                onPress={handleBotRestart}
                style={[styles.primaryButton, styles.restartButton, { backgroundColor: theme.accent }]}
                accessibilityRole="button"
                accessibilityLabel="Yeniden oyna">
                <Text style={[styles.primaryButtonText, { color: theme.accentText }]}>YENİDEN OYNA</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {stage === 'in_room' && code && (
        <View style={styles.roomBody}>
          <View style={styles.roomTop}>
            <Pressable
              onPress={() => Clipboard.setString(code)}
              style={[styles.codeBadge, { backgroundColor: theme.surface, borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel="Oda kodunu kopyala">
              <Text style={[styles.codeBadgeLabel, { color: theme.textFaint }]}>ODA KODU · kopyalamak için dokun</Text>
              <Text style={[styles.codeBadgeValue, { color: theme.text }]}>{code}</Text>
            </Pressable>

            <View style={styles.statusRow}>
              {game?.status === 'active' && (
                <View
                  style={[
                    styles.turnDot,
                    {
                      backgroundColor: isMyTurn ? theme.accent : theme.textFaint,
                    },
                  ]}
                />
              )}
              <Text style={[styles.status, { color: theme.textMuted }]}>{statusText}</Text>
            </View>
          </View>

          <View style={styles.boardWrap}>
            {game?.status === 'waiting' ? (
              <ActivityIndicator color={theme.identity} style={styles.waitingSpinner} />
            ) : (
              <ChessBoard
                fen={game?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'}
                myColor={myColor}
                isMyTurn={isMyTurn}
                onMove={handleMove}
                size={boardSize}
              />
            )}
          </View>

          <View style={styles.roomBottom}>
            {game?.status === 'finished' && (
              <Pressable
                onPress={handleRestart}
                style={[styles.primaryButton, styles.restartButton, { backgroundColor: theme.accent }]}
                accessibilityRole="button"
                accessibilityLabel="Yeniden oyna">
                <Text style={[styles.primaryButtonText, { color: theme.accentText }]}>YENİDEN OYNA</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  header: {
    width: '100%',
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  menuLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerSpacer: {
    width: 40,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  menuBody: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  menuHint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 19,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  orText: {
    marginVertical: 18,
    fontSize: 12,
    fontWeight: '600',
  },
  codeInput: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 14,
  },
  secondaryButton: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  difficultyButton: {
    marginBottom: 12,
  },
  disabled: {
    opacity: 0.5,
  },
  roomBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  roomTop: {
    width: '100%',
    alignItems: 'center',
  },
  boardWrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomBottom: {
    width: '100%',
    alignItems: 'center',
    minHeight: 8,
  },
  codeBadge: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 10,
  },
  codeBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  codeBadgeValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  turnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
  },
  qualityBadge: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  premoveBadge: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  waitingSpinner: {
    marginTop: 40,
  },
  restartButton: {
    marginTop: 8,
    marginBottom: 4,
    width: 200,
  },
});

export default ChessRoomScreen;
