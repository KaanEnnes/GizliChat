import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import Avatar from './Avatar';
import { replyPreviewLabel } from './MessageBubble';
import { fetchMediaCount, fetchRecentMedia, fetchStarredMessages, type ChatMessage } from '../services/chatService';
import { fetchAccountUsername, ONLINE_THRESHOLD_MS, subscribeToPresence } from '../services/userService';
import { Contact } from '../services/contactService';
import { PhoneCallIcon, VideoCallIcon } from './CallIcons';

/** How many of the room's most recent media items to show the instant the gallery opens from this screen — ChatRoomScreen keeps loading the rest of the room's history in behind it (see its galleryMessageId effect) and swaps in the full list once that resolves. */
const RECENT_MEDIA_PREVIEW_COUNT = 10;

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
  /**
   * Opens the shared room-wide gallery already used for tapping an image in the chat, seeded
   * with just the most recent media (see RECENT_MEDIA_PREVIEW_COUNT) for an instant open —
   * ChatRoomScreen's own gallery-open plumbing takes it from there and fetches the room's
   * complete media history in the background (same as it already does when the gallery is
   * opened by tapping an image inline).
   */
  onOpenMedia: (recentMedia: ChatMessage[], initialMessageId: string) => void;
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
  const [mediaCount, setMediaCount] = useState<number | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    return subscribeToPresence(contact.uid, setLastActiveAt);
  }, [visible, contact.uid]);

  // Just the count, computed server-side (no message bodies — no inline base64 mediaUrl
  // payloads — cross the wire for this), so the badge shows up fast even in a room with a lot
  // of exchanged photos/videos. The full list (fetchAllMedia, see its doc comment for why that
  // one's expensive) is only fetched below once the user actually taps the row to open the
  // gallery — this used to run eagerly here just to display a number, which is what made this
  // whole screen visibly freeze on open.
  useEffect(() => {
    if (!visible) {
      return;
    }
    setMediaCount(null);
    fetchMediaCount(roomId)
      .then(setMediaCount)
      .catch(() => setMediaCount(0));
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

  const handleOpenMediaRow = () => {
    if (!mediaCount) {
      return;
    }
    setMediaLoading(true);
    fetchRecentMedia(roomId, RECENT_MEDIA_PREVIEW_COUNT)
      .then(recent => {
        if (recent.length > 0) {
          handleClose();
          onOpenMedia(recent, recent[recent.length - 1].id);
        }
      })
      .finally(() => setMediaLoading(false));
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
                  <PhoneCallIcon color={theme.text} size={21} />
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
                  <VideoCallIcon color={theme.text} size={21} />
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
                disabled={!mediaCount || mediaLoading}
                onPress={handleOpenMediaRow}>
                <Text style={[styles.listRowText, { color: theme.text }]}>📎 Medya, bağlantı ve belgeler</Text>
                {mediaLoading ? (
                  <ActivityIndicator color={theme.textMuted} size="small" />
                ) : (
                  <Text style={[styles.listRowValue, { color: theme.textMuted }]}>{mediaCount ?? '…'}</Text>
                )}
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
