import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import Avatar from './Avatar';
import { replyPreviewLabel } from './MessageBubble';
import { fetchAllMedia, fetchStarredMessages, type ChatMessage } from '../services/chatService';
import { fetchAccountUsername, ONLINE_THRESHOLD_MS, subscribeToPresence } from '../services/userService';
import { Contact } from '../services/contactService';

interface Props {
  visible: boolean;
  contact: Contact;
  contactPhotoUrl?: string;
  myUid: string;
  roomId: string;
  onClose: () => void;
  onOpenSearch: () => void;
  onStartVoiceCall: () => void;
  onStartVideoCall: () => void;
  onJumpToMessage: (messageId: string) => void;
  /** Opens the shared room-wide gallery already used for tapping an image in the chat, seeded with this room's entire media history. */
  onOpenMedia: (media: ChatMessage[]) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString('tr-TR')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/** WhatsApp-style "kişi bilgisi" screen — opened by tapping the contact's name/avatar in the chat header. No phone number exists in this app's data model (username/password auth, not phone-based), so the username stands in for it. Presented as a full-screen Modal rather than a stack push, matching the app's hand-rolled useState-based screen switching (no navigation library). */
function ContactInfoScreen({
  visible,
  contact,
  contactPhotoUrl,
  myUid,
  roomId,
  onClose,
  onOpenSearch,
  onStartVoiceCall,
  onStartVideoCall,
  onJumpToMessage,
  onOpenMedia,
}: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [view, setView] = useState<'info' | 'starred'>('info');
  const [lastActiveAt, setLastActiveAt] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [starred, setStarred] = useState<ChatMessage[] | null>(null);
  const [starredError, setStarredError] = useState<string | null>(null);
  const [media, setMedia] = useState<ChatMessage[] | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    return subscribeToPresence(contact.uid, setLastActiveAt);
  }, [visible, contact.uid]);

  // Fetches the room's ENTIRE media history, not just whatever page of
  // messages happens to be loaded in the open chat — that was the previous
  // bug here (see fetchAllMedia's doc comment): a room with older photos
  // outside the currently-loaded window showed "0" even when media existed.
  // Kept in full (not just a count) so tapping the row can open the gallery
  // on it directly, without a second fetch.
  useEffect(() => {
    if (!visible) {
      return;
    }
    setMedia(null);
    fetchAllMedia(roomId)
      .then(setMedia)
      .catch(() => setMedia([]));
  }, [visible, roomId]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    fetchAccountUsername(contact.uid).then(setUsername).catch(() => undefined);
  }, [visible, contact.uid]);

  useEffect(() => {
    if (view !== 'starred' || starred !== null) {
      return;
    }
    fetchStarredMessages(roomId, myUid)
      .then(setStarred)
      .catch(err => setStarredError((err as Error).message));
  }, [view, starred, roomId, myUid]);

  const handleClose = () => {
    setView('info');
    setStarred(null);
    setStarredError(null);
    onClose();
  };

  const isOnline = lastActiveAt != null && Date.now() - lastActiveAt < ONLINE_THRESHOLD_MS;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={view === 'starred' ? () => setView('info') : handleClose} hitSlop={8}>
            <Text style={[styles.headerIcon, { color: theme.text }]}>{view === 'starred' ? '←' : '✕'}</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{view === 'starred' ? '⭐ Yıldızlı mesajlar' : 'Kişi bilgisi'}</Text>
          <View style={{ width: 24 }} />
        </View>

        {view === 'info' && (
          <>
            <View style={styles.profileSection}>
              <Avatar name={contact.name} size={96} photoUrl={contactPhotoUrl} />
              <Text style={[styles.name, { color: theme.text }]}>{contact.name}</Text>
              {!!username && <Text style={[styles.username, { color: theme.textMuted }]}>@{username}</Text>}
              <Text style={[styles.status, { color: isOnline ? theme.success : theme.textFaint }]}>
                {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
              </Text>
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  handleClose();
                  onStartVoiceCall();
                }}>
                <View style={[styles.actionIconWrap, { backgroundColor: theme.surfaceAlt }]}>
                  <Text style={styles.actionIcon}>📞</Text>
                </View>
                <Text style={[styles.actionLabel, { color: theme.text }]}>Sesli</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  handleClose();
                  onStartVideoCall();
                }}>
                <View style={[styles.actionIconWrap, { backgroundColor: theme.surfaceAlt }]}>
                  <Text style={styles.actionIcon}>🎥</Text>
                </View>
                <Text style={[styles.actionLabel, { color: theme.text }]}>Görüntülü</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  handleClose();
                  onOpenSearch();
                }}>
                <View style={[styles.actionIconWrap, { backgroundColor: theme.surfaceAlt }]}>
                  <Text style={styles.actionIcon}>🔍</Text>
                </View>
                <Text style={[styles.actionLabel, { color: theme.text }]}>Ara</Text>
              </Pressable>
            </View>

            <View style={[styles.listSection, { borderTopColor: theme.border }]}>
              <Pressable
                style={styles.listRow}
                disabled={!media || media.length === 0}
                onPress={() => {
                  if (media && media.length > 0) {
                    handleClose();
                    onOpenMedia(media);
                  }
                }}>
                <Text style={[styles.listRowText, { color: theme.text }]}>📎 Medya, bağlantı ve belgeler</Text>
                <Text style={[styles.listRowValue, { color: theme.textMuted }]}>{media?.length ?? '…'}</Text>
              </Pressable>
              <Pressable style={styles.listRow} onPress={() => setView('starred')}>
                <Text style={[styles.listRowText, { color: theme.text }]}>⭐ Yıldızlı mesajlar</Text>
                <Text style={[styles.listRowValue, { color: theme.textMuted }]}>{starred?.length ?? '›'}</Text>
              </Pressable>
            </View>
          </>
        )}

        {view === 'starred' && (
          <View style={styles.starredList}>
            {starredError && <Text style={[styles.emptyText, { color: theme.danger }]}>{starredError}</Text>}
            {!starredError && starred === null && <ActivityIndicator color={theme.identity} style={{ marginTop: 24 }} />}
            {!starredError && starred?.length === 0 && (
              <Text style={[styles.emptyText, { color: theme.textFaint }]}>Henüz yıldızlanmış mesaj yok.</Text>
            )}
            {starred?.map(message => (
              <Pressable
                key={message.id}
                style={[styles.starredRow, { borderBottomColor: theme.border }]}
                onPress={() => {
                  handleClose();
                  onJumpToMessage(message.id);
                }}>
                <Text style={[styles.starredRowText, { color: theme.text }]} numberOfLines={1}>
                  {replyPreviewLabel(message)}
                </Text>
                <Text style={[styles.starredRowMeta, { color: theme.textFaint }]}>
                  {message.senderId === myUid ? 'Sen' : contact.name} · {formatTime(message.createdAt)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: { fontSize: 20, fontWeight: '700', width: 24 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  profileSection: { alignItems: 'center', paddingVertical: 24 },
  name: { fontSize: 19, fontWeight: '700', marginTop: 12 },
  username: { fontSize: 13.5, marginTop: 2 },
  status: { fontSize: 12.5, marginTop: 4 },
  actionsRow: { flexDirection: 'row', justifyContent: 'center', gap: 32, paddingBottom: 16 },
  actionButton: { alignItems: 'center', gap: 6 },
  actionIconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 18 },
  actionLabel: { fontSize: 11.5 },
  listSection: { borderTopWidth: StyleSheet.hairlineWidth },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  listRowText: { fontSize: 14 },
  listRowValue: { fontSize: 13.5 },
  starredList: { flex: 1, paddingHorizontal: 16 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  starredRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  starredRowText: { fontSize: 13.5, fontWeight: '600' },
  starredRowMeta: { fontSize: 11.5, marginTop: 2 },
});

export default ContactInfoScreen;
