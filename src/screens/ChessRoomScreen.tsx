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
import ChessBoard from '../components/ChessBoard';
import {
  ChessGame,
  createChessRoom,
  joinChessRoom,
  playRoomChessMove,
  restartChessRoom,
  subscribeToChessRoom,
} from '../services/chessService';

interface Props {
  onBack: () => void;
}

type Stage = 'menu' | 'joining' | 'in_room';

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

  useEffect(() => {
    return () => {
      gameUnsubRef.current?.();
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
    setStage('menu');
    setCode(null);
    setGame(null);
    setError(null);
  }, []);

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
          onPress={stage === 'in_room' ? handleLeave : onBack}
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
