import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Contact } from '../services/contactService';
import { playGameOverSound, playTapSound, playWinSound } from '../services/soundService';
import { playMove, startGame, TicTacToeGame, winningLine } from '../services/ticTacToeService';

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  myUid: string;
  contact: Contact;
  game: TicTacToeGame | null;
}

const BOARD_SIZE = 300;
const CELL_SIZE = (BOARD_SIZE - 8) / 3;

/**
 * Real-time XOX against the contact this chat room belongs to — a Firestore
 * doc at rooms/{roomId}/game/ticTacToe (see ticTacToeService.ts) is the
 * single source of truth both devices render from, the same "shared
 * document, no client-authoritative state" pattern the chat messages
 * themselves already use.
 */
function OnlineTicTacToeModal({ visible, onClose, roomId, myUid, contact, game }: Props): React.JSX.Element {
  const { theme } = useTheme();

  const myMark = game && game.playerX === myUid ? 'X' : game && game.playerO === myUid ? 'O' : null;
  const isMyTurn = !!game && game.status === 'active' && game.turnUid === myUid;
  const winLine = useMemo(() => {
    if (!game || game.status !== 'finished' || game.outcome === 'draw' || !game.outcome) {
      return null;
    }
    return winningLine(game.board, game.outcome === 'x' ? 'X' : 'O');
  }, [game]);

  // Plays the finish sound exactly once per finished game — keyed off
  // `updatedAt` so a rematch (a brand new doc write) is treated as a fresh
  // result even though status goes back through 'finished' again later.
  const lastAnnouncedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!visible || !game || game.status !== 'finished' || lastAnnouncedRef.current === game.updatedAt) {
      return;
    }
    lastAnnouncedRef.current = game.updatedAt;
    const iWon = (game.outcome === 'x' && myMark === 'X') || (game.outcome === 'o' && myMark === 'O');
    if (iWon) {
      playWinSound();
    } else {
      playGameOverSound();
    }
  }, [visible, game, myMark]);

  const handleStart = () => {
    playTapSound();
    startGame(roomId, myUid, contact.uid).catch(() => undefined);
  };

  const handleCellPress = (index: number) => {
    if (!game || !isMyTurn || game.board[index] !== null) {
      return;
    }
    playTapSound();
    playMove(roomId, game, index, myUid).catch(() => undefined);
  };

  let statusText: string;
  if (!game || game.status === 'finished') {
    statusText = game ? resultText(game, myMark, contact.name) : `${contact.name} ile yeni bir oyun başlat`;
  } else if (isMyTurn) {
    statusText = 'Sırası sende';
  } else {
    statusText = `Sırası ${contact.name}'da`;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>XOX — {contact.name}</Text>
            <View style={styles.headerActions}>
              <Pressable
                onPress={handleStart}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Oyunu sıfırla — her iki taraf da sıfırlayabilir">
                <Text style={[styles.closeIcon, { color: theme.textMuted }]}>🔄</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kapat">
                <Text style={[styles.closeIcon, { color: theme.textMuted }]}>✕</Text>
              </Pressable>
            </View>
          </View>

          <Text style={[styles.status, { color: theme.textMuted }]}>{statusText}</Text>

          <View
            style={[
              styles.board,
              { width: BOARD_SIZE, height: BOARD_SIZE, backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}>
            {[0, 1, 2].map(row => (
              <View key={row} style={styles.boardRow}>
                {[0, 1, 2].map(col => {
                  const i = row * 3 + col;
                  const cell = game?.board[i] ?? null;
                  const onWinLine = winLine?.includes(i) ?? false;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => handleCellPress(i)}
                      disabled={!game || !isMyTurn || cell !== null}
                      style={[
                        styles.cell,
                        {
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          backgroundColor: onWinLine ? `${theme.accent}26` : theme.surface,
                          borderColor: theme.border,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Hücre ${i + 1}${cell ? `, ${cell}` : ''}`}>
                      {cell && (
                        <Text style={[styles.cellText, { color: cell === 'X' ? theme.identity : theme.accent }]}>
                          {cell}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {(!game || game.status === 'finished') && (
            <Pressable
              onPress={handleStart}
              style={[styles.startButton, { backgroundColor: theme.accent }]}
              accessibilityRole="button"
              accessibilityLabel={game ? 'Yeniden oyna' : 'Oyunu başlat'}>
              <Text style={[styles.startButtonText, { color: theme.accentText }]}>
                {game ? 'YENİDEN OYNA' : 'OYUNU BAŞLAT'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function resultText(game: TicTacToeGame, myMark: 'X' | 'O' | null, contactName: string): string {
  if (game.status !== 'finished') {
    return '';
  }
  if (game.outcome === 'draw') {
    return 'Berabere';
  }
  const iWon = (game.outcome === 'x' && myMark === 'X') || (game.outcome === 'o' && myMark === 'O');
  return iWon ? 'Kazandın! 🎉' : `${contactName} kazandı`;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    padding: 4,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  board: {
    flexDirection: 'column',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    overflow: 'hidden',
  },
  boardRow: {
    flexDirection: 'row',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cellText: {
    fontSize: 34,
    fontWeight: '800',
  },
  startButton: {
    marginTop: 20,
    borderRadius: 14,
    paddingHorizontal: 26,
    paddingVertical: 13,
  },
  startButtonText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default OnlineTicTacToeModal;
