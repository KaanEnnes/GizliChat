import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Contact } from '../services/contactService';
import { playGameOverSound, playTapSound, playWinSound } from '../services/soundService';
import { ChessGame, playContactChessMove, START_FEN, startContactChessGame } from '../services/chessService';
import ChessBoard from './ChessBoard';

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  myUid: string;
  contact: Contact;
  game: ChessGame | null;
}

/** Real-time chess against the contact this chat room belongs to — same shared-Firestore-doc pattern as OnlineTicTacToeModal, see chessService.ts. */
function ChessContactModal({ visible, onClose, roomId, myUid, contact, game }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 72, 340);

  const myColor: 'w' | 'b' | null = game
    ? game.playerWhite === myUid
      ? 'w'
      : game.playerBlack === myUid
      ? 'b'
      : null
    : null;
  const isMyTurn = !!game && game.status === 'active' && !!myColor && game.fen.split(' ')[1] === myColor;

  const lastAnnouncedRef = useRef<number | null>(null);
  useEffect(() => {
    if (!visible || !game || game.status !== 'finished' || lastAnnouncedRef.current === game.updatedAt) {
      return;
    }
    lastAnnouncedRef.current = game.updatedAt;
    const iWon = (game.outcome === 'white' && myColor === 'w') || (game.outcome === 'black' && myColor === 'b');
    if (iWon) {
      playWinSound();
    } else {
      playGameOverSound();
    }
  }, [visible, game, myColor]);

  const handleStart = () => {
    playTapSound();
    startContactChessGame(roomId, myUid, contact.uid).catch(() => undefined);
  };

  const handleMove = (from: string, to: string) => {
    if (!game) {
      return;
    }
    playTapSound();
    playContactChessMove(roomId, game, from, to, myUid).catch(() => undefined);
  };

  let statusText: string;
  if (!game || game.status === 'finished') {
    statusText = game
      ? game.outcome === 'draw'
        ? 'Berabere'
        : (game.outcome === 'white' && myColor === 'w') || (game.outcome === 'black' && myColor === 'b')
        ? 'Kazandın! 🎉'
        : `${contact.name} kazandı`
      : `${contact.name} ile yeni bir oyun başlat`;
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
            <Text style={[styles.title, { color: theme.text }]}>Satranç — {contact.name}</Text>
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

          <ChessBoard
            fen={game?.fen ?? START_FEN}
            myColor={myColor}
            isMyTurn={isMyTurn}
            onMove={handleMove}
            size={boardSize}
          />

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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
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

export default ChessContactModal;
