import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addContact, Contact, subscribeToContacts } from '../services/contactService';
import { ChatMessage, getRoomId, subscribeToLatestMessage } from '../services/chatService';
import { getLastReadAt, markRoomRead } from '../services/readStatusService';
import { Account, findUserByUsername } from '../services/userService';
import { useTheme } from '../theme/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const WEEKDAYS_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

function formatListTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp >= startOfToday) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  if (timestamp >= startOfToday - 86_400_000) {
    return 'Dün';
  }
  if (timestamp >= startOfToday - 6 * 86_400_000) {
    return WEEKDAYS_TR[date.getDay()];
  }
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear().toString().slice(-2)}`;
}

function formatPreview(message: ChatMessage | null | undefined, myUid: string): string {
  if (!message) {
    return 'Henüz mesaj yok';
  }
  const prefix = message.senderId === myUid ? 'Sen: ' : '';
  switch (message.type) {
    case 'image':
      return `${prefix}📷 Fotoğraf`;
    case 'video':
      return `${prefix}🎥 Video`;
    case 'audio':
      return `${prefix}🎤 Sesli mesaj`;
    case 'call': {
      const kind = message.callVideo ? 'Görüntülü arama' : 'Sesli arama';
      if (message.callStatus === 'missed') {
        return `Cevapsız ${kind.toLowerCase()}`;
      }
      return `${prefix}📞 ${kind}`;
    }
    default:
      return `${prefix}${message.text}`;
  }
}

interface Props {
  account: Account;
  onOpenRoom: (contact: Contact) => void;
  onLogout: () => void;
}

function ContactsScreen({ account, onOpenRoom, onLogout }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isOnline = useNetworkStatus();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [latestMessages, setLatestMessages] = useState<Record<string, ChatMessage | null>>({});
  const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});
  const roomUnsubscribesRef = useRef<(() => void)[]>([]);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToContacts(
      account.uid,
      nextContacts => {
        setContacts(nextContacts);
        setLoadError(null);

        // Contact list rarely changes mid-session; simplest correct approach
        // is to tear down and rebuild every per-room listener on each update
        // rather than diffing, same pattern as NotificationCenter.
        roomUnsubscribesRef.current.forEach(unsub => unsub());
        roomUnsubscribesRef.current = nextContacts.map(contact => {
          const roomId = getRoomId(account.uid, contact.uid);
          getLastReadAt(roomId).then(readAt => {
            setLastReadMap(prev => (prev[contact.uid] === readAt ? prev : { ...prev, [contact.uid]: readAt }));
          });
          return subscribeToLatestMessage(roomId, message => {
            setLatestMessages(prev => ({ ...prev, [contact.uid]: message }));
          });
        });
      },
      error => setLoadError(`Kişiler yüklenemedi: ${error.message}`),
    );
    return () => {
      unsubscribe();
      roomUnsubscribesRef.current.forEach(unsub => unsub());
      roomUnsubscribesRef.current = [];
    };
  }, [account.uid]);

  const handleOpenRoom = useCallback(
    (contact: Contact) => {
      const roomId = getRoomId(account.uid, contact.uid);
      const now = Date.now();
      markRoomRead(roomId, now);
      setLastReadMap(prev => ({ ...prev, [contact.uid]: now }));
      onOpenRoom(contact);
    },
    [account.uid, onOpenRoom],
  );

  const handleAddContact = useCallback(async () => {
    if (adding) {
      return;
    }
    const usernameQuery = usernameDraft.trim();
    if (!usernameQuery) {
      setAddError('Bir kullanıcı adı gir.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const found = await findUserByUsername(usernameQuery);
      if (!found) {
        setAddError('Bu kullanıcı adıyla bir hesap bulunamadı.');
        return;
      }
      if (found.uid === account.uid) {
        setAddError('Kendini ekleyemezsin.');
        return;
      }
      const nickname = nicknameDraft.trim() || found.username;
      await addContact(account.uid, found.uid, nickname);
      setAddModalVisible(false);
      setUsernameDraft('');
      setNicknameDraft('');
    } catch (error) {
      setAddError(`Kişi eklenemedi: ${(error as Error).message}`);
    } finally {
      setAdding(false);
    }
  }, [adding, usernameDraft, nicknameDraft, account.uid]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Kişiler</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textFaint }]}>@{account.username}</Text>
        </View>
        <Pressable onPress={onLogout} hitSlop={8}>
          <Text style={styles.logoutText}>Çıkış</Text>
        </Pressable>
      </View>

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📡 İnternet bağlantısı yok — sohbetler güncellenemiyor</Text>
        </View>
      )}

      {loadError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </View>
      )}

      <FlatList
        data={contacts}
        keyExtractor={item => item.uid}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textFaint }]}>
            Henüz kişin yok. Aşağıdan bir kullanıcı adı ile ekle.
          </Text>
        }
        renderItem={({ item }) => {
          const latest = latestMessages[item.uid];
          const lastReadAt = lastReadMap[item.uid] ?? 0;
          const isUnread = !!latest && latest.senderId !== account.uid && latest.createdAt > lastReadAt;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.contactRow,
                { backgroundColor: theme.surface, borderColor: theme.border },
                pressed && styles.contactRowPressed,
              ]}
              onPress={() => handleOpenRoom(item)}>
              <View style={styles.contactAvatar}>
                <Text style={styles.contactAvatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.contactBody}>
                <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text
                  style={[
                    styles.contactPreview,
                    { color: isUnread ? theme.text : theme.textMuted },
                    isUnread && styles.contactPreviewUnread,
                  ]}
                  numberOfLines={1}>
                  {formatPreview(latest, account.uid)}
                </Text>
              </View>
              {latest && (
                <View style={styles.contactMeta}>
                  <Text
                    style={[
                      styles.contactTime,
                      { color: isUnread ? theme.accent : theme.textFaint },
                      isUnread && styles.contactTimeUnread,
                    ]}>
                    {formatListTimestamp(latest.createdAt)}
                  </Text>
                  {isUnread && <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />}
                </View>
              )}
            </Pressable>
          );
        }}
      />

      <Pressable
        style={[styles.addButton, { marginBottom: insets.bottom + 16 }]}
        onPress={() => {
          setAddError(null);
          setUsernameDraft('');
          setNicknameDraft('');
          setAddModalVisible(true);
        }}>
        <Text style={styles.addButtonText}>+ Kişi Ekle</Text>
      </Pressable>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Kişi Ekle</Text>
            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
              ]}
              placeholder="Kullanıcı adı"
              placeholderTextColor={theme.textFaint}
              value={usernameDraft}
              onChangeText={setUsernameDraft}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              editable={!adding}
            />
            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
              ]}
              placeholder="Takma ad (opsiyonel)"
              placeholderTextColor={theme.textFaint}
              value={nicknameDraft}
              onChangeText={setNicknameDraft}
              maxLength={24}
              editable={!adding}
              onSubmitEditing={handleAddContact}
            />
            {addError && <Text style={styles.errorTextModal}>{addError}</Text>}
            <Pressable
              style={[styles.submitButton, adding && styles.submitButtonDisabled]}
              onPress={handleAddContact}
              disabled={adding}>
              {adding ? (
                <ActivityIndicator color="#0F1115" />
              ) : (
                <Text style={styles.submitButtonText}>Ekle</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.cancelButton}
              onPress={() => setAddModalVisible(false)}
              disabled={adding}>
              <Text style={styles.cancelButtonText}>Vazgeç</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    color: '#F5F5F7',
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: 'rgba(245,245,247,0.45)',
    fontSize: 12,
    marginTop: 2,
  },
  logoutText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: 'rgba(255,107,107,0.12)',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorBannerText: {
    color: '#FF6B6B',
    fontSize: 12.5,
  },
  offlineBanner: {
    backgroundColor: 'rgba(255,184,77,0.14)',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  offlineBannerText: {
    color: '#FFB84D',
    fontSize: 12.5,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyText: {
    color: 'rgba(245,245,247,0.4)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1F2A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  contactRowPressed: {
    opacity: 0.75,
  },
  contactAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3B7CFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  contactAvatarText: {
    color: '#0F1115',
    fontSize: 16,
    fontWeight: '800',
  },
  contactBody: {
    flex: 1,
    marginRight: 8,
  },
  contactName: {
    color: '#F5F5F7',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  contactPreview: {
    color: 'rgba(245,245,247,0.55)',
    fontSize: 13,
    fontWeight: '400',
  },
  contactPreviewUnread: {
    fontWeight: '700',
  },
  contactMeta: {
    alignItems: 'flex-end',
  },
  contactTime: {
    color: 'rgba(245,245,247,0.4)',
    fontSize: 11.5,
  },
  contactTimeUnread: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#4D96FF',
    marginTop: 6,
  },
  addButton: {
    marginHorizontal: 16,
    backgroundColor: '#3B7CFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#0F1115',
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,11,15,0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1C1F2A',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    color: '#F5F5F7',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#0F1115',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F5F5F7',
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  errorTextModal: {
    color: '#FF6B6B',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#3B7CFF',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#0F1115',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'rgba(245,245,247,0.5)',
    fontSize: 13,
  },
});

export default ContactsScreen;
