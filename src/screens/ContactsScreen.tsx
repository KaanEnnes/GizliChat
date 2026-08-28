import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addContact, Contact, removeContact, setContactFavorite, subscribeToContacts } from '../services/contactService';
import { ChatMessage, getRoomId, searchMessagesInRoom, subscribeToLatestMessage } from '../services/chatService';
import { getLastReadAt, markRoomRead } from '../services/readStatusService';
import {
  Account,
  findUserByUsername,
  ONLINE_THRESHOLD_MS,
  subscribeToPresence,
  subscribeToUserProfile,
  updateProfilePhoto,
} from '../services/userService';
import { useTheme } from '../theme/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import Avatar from '../components/Avatar';
import StorageQuotaBanner from '../components/StorageQuotaBanner';
import UpdateBanner from '../components/UpdateBanner';

const WEEKDAYS_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
// How often "online" status is re-evaluated against the wall clock — a
// Firestore presence listener only re-fires on a new write, so without this
// a contact who went idle would stay looking "online" forever.
const PRESENCE_RECHECK_MS = 20_000;
const MAX_ONLINE_SHOWN = 8;
const MAX_RECENT_CALLS_SHOWN = 5;
// How long to wait after the user stops typing before firing the (per-contact) search queries.
const GLOBAL_SEARCH_DEBOUNCE_MS = 350;
// Hard cap on how many matches the global search shows across all contacts, newest first.
const MAX_GLOBAL_SEARCH_RESULTS = 50;

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
    case 'file':
      return `${prefix}📄 Dosya`;
    case 'call': {
      const kind = message.callVideo ? 'Görüntülü arama' : 'Sesli arama';
      if (message.callStatus === 'missed') {
        return `Cevapsız ${kind.toLowerCase()}`;
      }
      return `${prefix}📞 ${kind}`;
    }
    case 'chess':
      return `${prefix}♟️ Satranç daveti`;
    default:
      return `${prefix}${message.text}`;
  }
}

function formatCallDetail(message: ChatMessage): string {
  if (message.callStatus === 'missed') {
    return 'Cevapsız';
  }
  const totalSeconds = message.durationSeconds ?? 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

interface Props {
  account: Account;
  onOpenRoom: (contact: Contact, messageIdToJumpTo?: string) => void;
  onOpenGames: () => void;
  onLogout: () => void;
}

interface GlobalSearchResult {
  contact: Contact;
  message: ChatMessage;
}

function ContactsScreen({ account, onOpenRoom, onOpenGames, onLogout }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const isOnline = useNetworkStatus();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [latestMessages, setLatestMessages] = useState<Record<string, ChatMessage | null>>({});
  const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, number | null>>({});
  const [contactPhotos, setContactPhotos] = useState<Record<string, string | undefined>>({});
  const [ownProfile, setOwnProfile] = useState<{ photoUrl?: string; videoBytesUsed: number }>({
    videoBytesUsed: 0,
  });
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const roomUnsubscribesRef = useRef<(() => void)[]>([]);
  const presenceUnsubscribesRef = useRef<(() => void)[]>([]);
  const profileUnsubscribesRef = useRef<(() => void)[]>([]);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult[]>([]);
  const [globalSearching, setGlobalSearching] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), PRESENCE_RECHECK_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToContacts(
      account.uid,
      nextContacts => {
        setContacts(nextContacts);
        setLoadError(null);

        // Contact list rarely changes mid-session; simplest correct approach
        // is to tear down and rebuild every per-room/per-presence listener on
        // each update rather than diffing, same pattern as NotificationCenter.
        roomUnsubscribesRef.current.forEach(unsub => unsub());
        presenceUnsubscribesRef.current.forEach(unsub => unsub());
        profileUnsubscribesRef.current.forEach(unsub => unsub());
        roomUnsubscribesRef.current = nextContacts.map(contact => {
          const roomId = getRoomId(account.uid, contact.uid);
          getLastReadAt(roomId).then(readAt => {
            setLastReadMap(prev => (prev[contact.uid] === readAt ? prev : { ...prev, [contact.uid]: readAt }));
          });
          return subscribeToLatestMessage(roomId, account.uid, message => {
            setLatestMessages(prev => ({ ...prev, [contact.uid]: message }));
          });
        });
        presenceUnsubscribesRef.current = nextContacts.map(contact =>
          subscribeToPresence(contact.uid, lastActiveAt => {
            setPresenceMap(prev => (prev[contact.uid] === lastActiveAt ? prev : { ...prev, [contact.uid]: lastActiveAt }));
          }),
        );
        profileUnsubscribesRef.current = nextContacts.map(contact =>
          subscribeToUserProfile(contact.uid, profile => {
            setContactPhotos(prev => (prev[contact.uid] === profile.photoUrl ? prev : { ...prev, [contact.uid]: profile.photoUrl }));
          }),
        );
      },
      error => setLoadError(`Kişiler yüklenemedi: ${error.message}`),
    );
    return () => {
      unsubscribe();
      roomUnsubscribesRef.current.forEach(unsub => unsub());
      roomUnsubscribesRef.current = [];
      presenceUnsubscribesRef.current.forEach(unsub => unsub());
      presenceUnsubscribesRef.current = [];
      profileUnsubscribesRef.current.forEach(unsub => unsub());
      profileUnsubscribesRef.current = [];
    };
  }, [account.uid]);

  useEffect(() => {
    return subscribeToUserProfile(account.uid, setOwnProfile);
  }, [account.uid]);

  const handleChangeOwnPhoto = useCallback(() => {
    if (changingPhoto) {
      return;
    }
    launchImageLibrary({ mediaType: 'photo', quality: 0.5, maxWidth: 300, maxHeight: 300, includeBase64: true }, async result => {
      if (result.didCancel || !result.assets || result.assets.length === 0) {
        return;
      }
      const asset = result.assets[0];
      if (!asset.base64) {
        return;
      }
      setChangingPhoto(true);
      try {
        await updateProfilePhoto(account.uid, `data:${asset.type || 'image/jpeg'};base64,${asset.base64}`);
      } catch {
        // Non-fatal — profile photo is a cosmetic touch, worth a silent retry-next-time over a modal.
      } finally {
        setChangingPhoto(false);
      }
    });
  }, [account.uid, changingPhoto]);

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

  const handleOpenSearchResult = useCallback(
    (result: GlobalSearchResult) => {
      const roomId = getRoomId(account.uid, result.contact.uid);
      const now = Date.now();
      markRoomRead(roomId, now);
      setLastReadMap(prev => ({ ...prev, [result.contact.uid]: now }));
      setGlobalSearchOpen(false);
      setGlobalSearchQuery('');
      onOpenRoom(result.contact, result.message.id);
    },
    [account.uid, onOpenRoom],
  );

  const handleCloseGlobalSearch = useCallback(() => {
    setGlobalSearchOpen(false);
    setGlobalSearchQuery('');
  }, []);

  // Debounced: waits for a pause in typing, then searches every contact's
  // room in parallel (one-off queries, not live) and merges the results.
  useEffect(() => {
    const needle = globalSearchQuery.trim();
    if (!needle) {
      setGlobalSearchResults([]);
      setGlobalSearching(false);
      return undefined;
    }
    setGlobalSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      Promise.all(
        contacts.map(async contact => {
          const matches = await searchMessagesInRoom(getRoomId(account.uid, contact.uid), account.uid, needle);
          return matches.map(message => ({ contact, message }));
        }),
      )
        .then(perContact => {
          if (cancelled) {
            return;
          }
          const merged = perContact
            .flat()
            .sort((a, b) => b.message.createdAt - a.message.createdAt)
            .slice(0, MAX_GLOBAL_SEARCH_RESULTS);
          setGlobalSearchResults(merged);
        })
        .finally(() => {
          if (!cancelled) {
            setGlobalSearching(false);
          }
        });
    }, GLOBAL_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [globalSearchQuery, contacts, account.uid]);

  const handleToggleFavorite = useCallback(
    (contact: Contact) => {
      setContactFavorite(account.uid, contact.uid, !contact.favorite).catch(() => undefined);
    },
    [account.uid],
  );

  const handleDeleteChat = useCallback(
    (contact: Contact) => {
      Alert.alert('Sohbeti sil?', undefined, [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            removeContact(account.uid, contact.uid).catch(() => undefined);
          },
        },
      ]);
    },
    [account.uid],
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

  const isContactOnline = useCallback(
    (uid: string) => {
      const lastActiveAt = presenceMap[uid];
      return lastActiveAt != null && nowTick - lastActiveAt < ONLINE_THRESHOLD_MS;
    },
    [presenceMap, nowTick],
  );

  // --- Derived dashboard sections -----------------------------------------
  const favoriteContacts = useMemo(() => contacts.filter(c => c.favorite), [contacts]);

  const onlineContacts = useMemo(
    () => contacts.filter(c => isContactOnline(c.uid)).slice(0, MAX_ONLINE_SHOWN),
    [contacts, isContactOnline],
  );

  const recentCalls = useMemo(() => {
    return contacts
      .map(contact => ({ contact, message: latestMessages[contact.uid] }))
      .filter((entry): entry is { contact: Contact; message: ChatMessage } => entry.message?.type === 'call')
      .sort((a, b) => b.message.createdAt - a.message.createdAt)
      .slice(0, MAX_RECENT_CALLS_SHOWN);
  }, [contacts, latestMessages]);

  // "Recent conversations" — the main list, most-recently-active room first
  // (falls back to when the contact was added if there's no message yet)
  // instead of contactService's default alphabetical order, since this
  // screen is now a dashboard, not a plain contact directory.
  const recentConversations = useMemo(() => {
    return [...contacts].sort((a, b) => {
      const aTime = latestMessages[a.uid]?.createdAt ?? a.addedAt;
      const bTime = latestMessages[b.uid]?.createdAt ?? b.addedAt;
      return bTime - aTime;
    });
  }, [contacts, latestMessages]);

  // Caps the dashboard's readable width on tablets/large screens instead of
  // letting rows stretch edge-to-edge.
  const contentMaxWidth = Math.min(width, 640);

  const renderHeader = () => (
    <View>
      <Pressable
        onPress={onOpenGames}
        style={({ pressed }) => [
          styles.gamesCard,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Mini oyunlara git">
        <View style={[styles.gamesIconBadge, { backgroundColor: theme.identity + '26' }]}>
          <Text style={styles.gamesIcon}>🎮</Text>
        </View>
        <View style={styles.gamesTextWrap}>
          <Text style={[styles.gamesTitle, { color: theme.text }]}>Mini Oyunlar</Text>
          <Text style={[styles.gamesSubtitle, { color: theme.textMuted }]}>
            Oyunlara göz at, skorunu yükselt
          </Text>
        </View>
        <Text style={[styles.gamesChevron, { color: theme.textFaint }]}>›</Text>
      </Pressable>

      {favoriteContacts.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Favoriler</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {favoriteContacts.map(contact => (
              <Pressable
                key={contact.uid}
                onPress={() => handleOpenRoom(contact)}
                style={({ pressed }) => [styles.chipCard, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${contact.name} ile sohbet aç`}>
                <Avatar name={contact.name} size={54} photoUrl={contactPhotos[contact.uid]} online={isContactOnline(contact.uid)} />
                <Text style={[styles.chipLabel, { color: theme.text }]} numberOfLines={1}>
                  {contact.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {onlineContacts.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Çevrimiçi</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {onlineContacts.map(contact => (
              <Pressable
                key={contact.uid}
                onPress={() => handleOpenRoom(contact)}
                style={({ pressed }) => [styles.chipCard, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${contact.name}, çevrimiçi, sohbet aç`}>
                <Avatar name={contact.name} size={54} photoUrl={contactPhotos[contact.uid]} online />
                <Text style={[styles.chipLabel, { color: theme.text }]} numberOfLines={1}>
                  {contact.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {recentCalls.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Son Aramalar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {recentCalls.map(({ contact, message }) => {
              const missed = message.callStatus === 'missed';
              return (
                <Pressable
                  key={contact.uid}
                  onPress={() => handleOpenRoom(contact)}
                  style={({ pressed }) => [styles.callCard, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${contact.name} ile son arama, sohbeti aç`}>
                  <Avatar name={contact.name} size={40} photoUrl={contactPhotos[contact.uid]} />
                  <View style={styles.callCardTextWrap}>
                    <Text style={[styles.callCardName, { color: theme.text }]} numberOfLines={1}>
                      {contact.name}
                    </Text>
                    <Text style={[styles.callCardDetail, { color: missed ? theme.danger : theme.textMuted }]}>
                      {message.callVideo ? '🎥' : '📞'} {formatCallDetail(message)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Text style={[styles.sectionTitle, styles.conversationsTitle, { color: theme.textMuted }]}>
        Sohbetler
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.centered, { maxWidth: contentMaxWidth }]}>
        <View style={[styles.header, { borderBottomColor: theme.border, paddingTop: insets.top + 12 }]}>
          <View style={styles.headerIdentity}>
            <Pressable
              onPress={handleChangeOwnPhoto}
              disabled={changingPhoto}
              accessibilityRole="button"
              accessibilityLabel="Profil fotoğrafını değiştir">
              <Avatar name={account.username} size={40} photoUrl={ownProfile.photoUrl} />
            </Pressable>
            <View style={styles.headerTextWrap}>
              <Text style={[styles.headerTitle, { color: theme.text }]}>Merhaba, {account.username}</Text>
              <Text style={[styles.headerSubtitle, { color: theme.textFaint }]}>@{account.username}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setGlobalSearchOpen(v => !v)}
            hitSlop={8}
            style={styles.headerSearchButton}
            accessibilityRole="button"
            accessibilityLabel="Tüm sohbetlerde ara">
            <Text style={styles.headerSearchIcon}>🔍</Text>
          </Pressable>
          <Pressable onPress={onLogout} hitSlop={8} accessibilityRole="button" accessibilityLabel="Çıkış yap">
            <Text style={[styles.logoutText, { color: theme.danger }]}>Çıkış</Text>
          </Pressable>
        </View>

        {globalSearchOpen && (
          <View style={[styles.globalSearchBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <TextInput
              value={globalSearchQuery}
              onChangeText={setGlobalSearchQuery}
              placeholder="Tüm sohbetlerde ara..."
              placeholderTextColor={theme.textFaint}
              style={[styles.globalSearchInput, { color: theme.text }]}
              autoFocus
            />
            <Pressable onPress={handleCloseGlobalSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel="Aramayı kapat">
              <Text style={[styles.searchNavIcon, { color: theme.text }]}>✕</Text>
            </Pressable>
          </View>
        )}

        {globalSearchOpen && globalSearchQuery.trim() ? (
          <FlatList
            data={globalSearchResults}
            keyExtractor={item => `${item.contact.uid}_${item.message.id}`}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.textFaint }]}>
                {globalSearching ? 'Aranıyor...' : 'Sonuç bulunamadı'}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.contactRow,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                  pressed && styles.contactRowPressed,
                ]}
                onPress={() => handleOpenSearchResult(item)}>
                <Avatar name={item.contact.name} size={44} photoUrl={contactPhotos[item.contact.uid]} />
                <View style={styles.contactBody}>
                  <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
                    {item.contact.name}
                  </Text>
                  <Text style={[styles.contactPreview, { color: theme.textMuted }]} numberOfLines={1}>
                    {item.message.senderId === account.uid ? 'Sen: ' : ''}
                    {item.message.text}
                  </Text>
                </View>
                <View style={styles.contactMeta}>
                  <Text style={[styles.contactTime, { color: theme.textFaint }]}>{formatListTimestamp(item.message.createdAt)}</Text>
                </View>
              </Pressable>
            )}
          />
        ) : (
          <>
        <StorageQuotaBanner usedBytes={ownProfile.videoBytesUsed} variant="card" />
        <UpdateBanner />

        {!isOnline && (
          <View style={[styles.offlineBanner, { backgroundColor: theme.warningSoft }]}>
            <Text style={[styles.offlineBannerText, { color: theme.warning }]}>
              📡 İnternet bağlantısı yok — sohbetler güncellenemiyor
            </Text>
          </View>
        )}

        {loadError && (
          <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft }]}>
            <Text style={[styles.errorBannerText, { color: theme.danger }]}>{loadError}</Text>
          </View>
        )}

        <FlatList
          data={recentConversations}
          keyExtractor={item => item.uid}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
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
                <Avatar name={item.name} size={44} photoUrl={contactPhotos[item.uid]} online={isContactOnline(item.uid)} />
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
                <View style={styles.contactMeta}>
                  {latest && (
                    <Text
                      style={[
                        styles.contactTime,
                        { color: isUnread ? theme.identity : theme.textFaint },
                        isUnread && styles.contactTimeUnread,
                      ]}>
                      {formatListTimestamp(latest.createdAt)}
                    </Text>
                  )}
                  {isUnread && <View style={[styles.unreadDot, { backgroundColor: theme.identity }]} />}
                </View>
                <Pressable
                  onPress={() => handleToggleFavorite(item)}
                  hitSlop={10}
                  style={styles.favoriteButton}
                  accessibilityRole="button"
                  accessibilityLabel={item.favorite ? `${item.name} favorilerden çıkar` : `${item.name} favorilere ekle`}>
                  <Text style={[styles.favoriteIcon, { color: item.favorite ? theme.accent : theme.textFaint }]}>
                    {item.favorite ? '★' : '☆'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleDeleteChat(item)}
                  hitSlop={10}
                  style={styles.favoriteButton}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name} sohbetini sil`}>
                  <Text style={[styles.favoriteIcon, { color: theme.textFaint }]}>🗑️</Text>
                </Pressable>
              </Pressable>
            );
          }}
        />

        <Pressable
          style={[styles.addButton, { backgroundColor: theme.accent, marginBottom: insets.bottom + 16 }]}
          onPress={() => {
            setAddError(null);
            setUsernameDraft('');
            setNicknameDraft('');
            setAddModalVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Yeni kişi ekle">
          <Text style={[styles.addButtonText, { color: theme.accentText }]}>+ Kişi Ekle</Text>
        </Pressable>
          </>
        )}
      </View>

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
            {addError && <Text style={[styles.errorTextModal, { color: theme.danger }]}>{addError}</Text>}
            <Pressable
              style={[styles.submitButton, { backgroundColor: theme.accent }, adding && styles.submitButtonDisabled]}
              onPress={handleAddContact}
              disabled={adding}>
              {adding ? (
                <ActivityIndicator color={theme.accentText} />
              ) : (
                <Text style={[styles.submitButtonText, { color: theme.accentText }]}>Ekle</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.cancelButton}
              onPress={() => setAddModalVisible(false)}
              disabled={adding}>
              <Text style={[styles.cancelButtonText, { color: theme.textMuted }]}>Vazgeç</Text>
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
  },
  centered: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
  },
  pressed: {
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTextWrap: {
    marginLeft: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  logoutText: {
    fontSize: 14,
    minHeight: 22,
    paddingVertical: 4,
  },
  headerSearchButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
  },
  headerSearchIcon: {
    fontSize: 20,
  },
  globalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  globalSearchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  searchNavIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  errorBannerText: {
    fontSize: 12.5,
  },
  offlineBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  offlineBannerText: {
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
    fontSize: 13,
    textAlign: 'center',
    marginTop: 40,
  },
  gamesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 18,
  },
  gamesIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  gamesIcon: {
    fontSize: 22,
  },
  gamesTextWrap: {
    flex: 1,
  },
  gamesTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  gamesSubtitle: {
    fontSize: 12,
  },
  gamesChevron: {
    fontSize: 22,
    fontWeight: '600',
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  conversationsTitle: {
    marginTop: 2,
  },
  chipRow: {
    paddingRight: 8,
  },
  chipCard: {
    alignItems: 'center',
    width: 72,
    marginRight: 10,
  },
  chipLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  callCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 10,
    width: 168,
  },
  callCardTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  callCardName: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  callCardDetail: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '800',
  },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderWidth: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  contactRowPressed: {
    opacity: 0.75,
  },
  contactBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  contactPreview: {
    fontSize: 13,
    fontWeight: '400',
  },
  contactPreviewUnread: {
    fontWeight: '700',
  },
  contactMeta: {
    alignItems: 'flex-end',
    minWidth: 40,
  },
  contactTime: {
    fontSize: 11.5,
  },
  contactTimeUnread: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginTop: 6,
  },
  favoriteButton: {
    marginLeft: 6,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteIcon: {
    fontSize: 20,
  },
  addButton: {
    marginHorizontal: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 22,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
  },
  errorTextModal: {
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  submitButton: {
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
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
  },
});

export default ContactsScreen;
