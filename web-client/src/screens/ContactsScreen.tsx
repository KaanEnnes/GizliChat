import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addContact, removeContact, setContactFavorite, subscribeToContacts, type Contact } from '../services/contactService';
import { getRoomId, searchMessagesInRoom, subscribeToLatestMessage, type ChatMessage } from '../services/chatService';
import { getLastReadAt, markRoomRead } from '../services/readStatusService';
import {
  findUserByUsername,
  ONLINE_THRESHOLD_MS,
  subscribeToPresence,
  subscribeToUserProfile,
  updateProfilePhoto,
  type Account,
} from '../services/userService';
import { resizeImageToDataUri } from '../services/mediaService';
import { useTheme } from '../theme/ThemeContext';
import Avatar from '../components/Avatar';

const WEEKDAYS_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const PRESENCE_RECHECK_MS = 20_000;
const MAX_ONLINE_SHOWN = 8;
const GLOBAL_SEARCH_DEBOUNCE_MS = 350;
const MAX_GLOBAL_SEARCH_RESULTS = 50;

function formatListTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (timestamp >= startOfToday) return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  if (timestamp >= startOfToday - 86_400_000) return 'Dün';
  if (timestamp >= startOfToday - 6 * 86_400_000) return WEEKDAYS_TR[date.getDay()];
  return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear().toString().slice(-2)}`;
}

function formatPreview(message: ChatMessage | null | undefined, myUid: string): string {
  if (!message) return 'Henüz mesaj yok';
  const prefix = message.senderId === myUid ? 'Sen: ' : '';
  switch (message.type) {
    case 'image': return `${prefix}📷 Fotoğraf`;
    case 'video': return `${prefix}🎥 Video`;
    case 'audio': return `${prefix}🎤 Sesli mesaj`;
    case 'song': return `${prefix}🎵 Şarkı`;
    case 'file': return `${prefix}📄 Dosya`;
    case 'call': return message.callStatus === 'missed' ? 'Cevapsız arama' : `${prefix}📞 Arama`;
    default: return `${prefix}${message.text}`;
  }
}

interface Props {
  account: Account;
  onOpenRoom: (contact: Contact, messageIdToJumpTo?: string) => void;
  onLogout: () => void;
  onGoHome: () => void;
}

interface GlobalSearchResult {
  contact: Contact;
  message: ChatMessage;
}

function ContactsScreen({ account, onOpenRoom, onLogout, onGoHome }: Props): React.JSX.Element {
  const { theme, mode, toggleTheme } = useTheme();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [latestMessages, setLatestMessages] = useState<Record<string, ChatMessage | null>>({});
  const [lastReadMap, setLastReadMap] = useState<Record<string, number>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, number | null>>({});
  const [contactPhotos, setContactPhotos] = useState<Record<string, string | undefined>>({});
  const [ownPhotoUrl, setOwnPhotoUrl] = useState<string | undefined>(undefined);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const roomUnsubsRef = useRef<(() => void)[]>([]);
  const presenceUnsubsRef = useRef<(() => void)[]>([]);
  const profileUnsubsRef = useRef<(() => void)[]>([]);
  const ownPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
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
        roomUnsubsRef.current.forEach(u => u());
        presenceUnsubsRef.current.forEach(u => u());
        profileUnsubsRef.current.forEach(u => u());
        roomUnsubsRef.current = nextContacts.map(contact => {
          const roomId = getRoomId(account.uid, contact.uid);
          setLastReadMap(prev => ({ ...prev, [contact.uid]: getLastReadAt(roomId) }));
          return subscribeToLatestMessage(roomId, account.uid, message => {
            setLatestMessages(prev => ({ ...prev, [contact.uid]: message }));
          });
        });
        presenceUnsubsRef.current = nextContacts.map(contact =>
          subscribeToPresence(contact.uid, lastActiveAt => {
            setPresenceMap(prev => (prev[contact.uid] === lastActiveAt ? prev : { ...prev, [contact.uid]: lastActiveAt }));
          }),
        );
        profileUnsubsRef.current = nextContacts.map(contact =>
          subscribeToUserProfile(contact.uid, profile => {
            setContactPhotos(prev => (prev[contact.uid] === profile.photoUrl ? prev : { ...prev, [contact.uid]: profile.photoUrl }));
          }),
        );
      },
      error => setLoadError(`Kişiler yüklenemedi: ${error.message}`),
    );
    return () => {
      unsubscribe();
      roomUnsubsRef.current.forEach(u => u());
      presenceUnsubsRef.current.forEach(u => u());
      profileUnsubsRef.current.forEach(u => u());
    };
  }, [account.uid]);

  useEffect(() => {
    return subscribeToUserProfile(account.uid, profile => setOwnPhotoUrl(profile.photoUrl));
  }, [account.uid]);

  const handleOwnPhotoChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || changingPhoto) return;
      setChangingPhoto(true);
      try {
        const dataUri = await resizeImageToDataUri(file, 300, 0.8);
        await updateProfilePhoto(account.uid, dataUri);
      } catch {
        // Profile photo is a cosmetic touch — worth a silent retry-next-time over a modal.
      } finally {
        setChangingPhoto(false);
      }
    },
    [account.uid, changingPhoto],
  );

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
          if (cancelled) return;
          const merged = perContact
            .flat()
            .sort((a, b) => b.message.createdAt - a.message.createdAt)
            .slice(0, MAX_GLOBAL_SEARCH_RESULTS);
          setGlobalSearchResults(merged);
        })
        .finally(() => {
          if (!cancelled) setGlobalSearching(false);
        });
    }, GLOBAL_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [globalSearchQuery, contacts, account.uid]);

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent, contact: Contact) => {
      e.stopPropagation();
      setContactFavorite(account.uid, contact.uid, !contact.favorite).catch(() => undefined);
    },
    [account.uid],
  );

  const handleDeleteChat = useCallback(
    (e: React.MouseEvent, contact: Contact) => {
      e.stopPropagation();
      if (window.confirm('Sohbeti sil?')) {
        removeContact(account.uid, contact.uid).catch(() => undefined);
      }
    },
    [account.uid],
  );

  const handleAddContact = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (adding) return;
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
        setAddModalOpen(false);
        setUsernameDraft('');
        setNicknameDraft('');
      } catch (error) {
        setAddError(`Kişi eklenemedi: ${(error as Error).message}`);
      } finally {
        setAdding(false);
      }
    },
    [adding, usernameDraft, nicknameDraft, account.uid],
  );

  const isContactOnline = useCallback(
    (uid: string) => {
      const lastActiveAt = presenceMap[uid];
      return lastActiveAt != null && nowTick - lastActiveAt < ONLINE_THRESHOLD_MS;
    },
    [presenceMap, nowTick],
  );

  const favoriteContacts = useMemo(() => contacts.filter(c => c.favorite), [contacts]);
  const onlineContacts = useMemo(() => contacts.filter(c => isContactOnline(c.uid)).slice(0, MAX_ONLINE_SHOWN), [contacts, isContactOnline]);
  const recentConversations = useMemo(
    () =>
      [...contacts].sort((a, b) => {
        const aTime = latestMessages[a.uid]?.createdAt ?? a.addedAt;
        const bTime = latestMessages[b.uid]?.createdAt ?? b.addedAt;
        return bTime - aTime;
      }),
    [contacts, latestMessages],
  );

  return (
    <div className="contacts-screen" style={{ background: theme.background }}>
      <div className="contacts-header" style={{ borderColor: theme.border }}>
        <div className="contacts-header-identity">
          <div
            style={{ cursor: 'pointer', opacity: changingPhoto ? 0.6 : 1 }}
            onClick={() => !changingPhoto && ownPhotoInputRef.current?.click()}
            title="Profil fotoğrafını değiştir">
            <Avatar name={account.username} size={40} photoUrl={ownPhotoUrl} />
          </div>
          <input ref={ownPhotoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleOwnPhotoChange} />
          <div style={{ marginLeft: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Merhaba, {account.username}</div>
            <div style={{ fontSize: 12, color: theme.textFaint }}>@{account.username}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            className="icon-btn"
            style={{ background: theme.surfaceAlt, color: theme.text }}
            onClick={() => setGlobalSearchOpen(v => !v)}
            title="Tüm sohbetlerde ara">
            🔍
          </button>
          <button className="icon-btn" style={{ background: theme.surfaceAlt, color: theme.text }} onClick={onGoHome} title="Ana sayfaya dön">
            🏠
          </button>
          <button className="icon-btn" style={{ background: theme.surfaceAlt, color: theme.text }} onClick={toggleTheme} title="Tema">
            {mode === 'dark' ? '☀️' : '🌙'}
          </button>
          <span style={{ fontSize: 14, color: theme.danger, cursor: 'pointer' }} onClick={onLogout}>
            Çıkış
          </span>
        </div>
      </div>

      {globalSearchOpen && (
        <div className="contacts-search-bar" style={{ background: theme.surface, borderColor: theme.border }}>
          <input
            className="contacts-search-input"
            style={{ color: theme.text }}
            placeholder="Tüm sohbetlerde ara..."
            value={globalSearchQuery}
            onChange={e => setGlobalSearchQuery(e.target.value)}
            autoFocus
          />
          <span style={{ cursor: 'pointer', color: theme.textFaint, fontSize: 16 }} onClick={handleCloseGlobalSearch}>
            ✕
          </span>
        </div>
      )}

      {loadError && (
        <div className="contacts-banner" style={{ background: theme.dangerSoft, color: theme.danger }}>
          {loadError}
        </div>
      )}

      {globalSearchOpen && globalSearchQuery.trim() ? (
        <div className="contacts-scroll">
          {globalSearchResults.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40, fontSize: 13, color: theme.textFaint }}>
              {globalSearching ? 'Aranıyor...' : 'Sonuç bulunamadı'}
            </div>
          )}
          {globalSearchResults.map(item => (
            <div
              key={`${item.contact.uid}_${item.message.id}`}
              className="contact-row"
              style={{ background: theme.surface, borderColor: theme.border }}
              onClick={() => handleOpenSearchResult(item)}>
              <Avatar name={item.contact.name} size={44} photoUrl={contactPhotos[item.contact.uid]} />
              <div className="contact-body">
                <div className="contact-name" style={{ color: theme.text }}>{item.contact.name}</div>
                <div className="contact-preview" style={{ color: theme.textMuted }}>
                  {item.message.senderId === account.uid ? 'Sen: ' : ''}
                  {item.message.text}
                </div>
              </div>
              <div className="contact-meta">
                <div style={{ fontSize: 11.5, color: theme.textFaint }}>{formatListTimestamp(item.message.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="contacts-scroll">
        {favoriteContacts.length > 0 && (
          <div className="contacts-section">
            <div className="contacts-section-title" style={{ color: theme.textMuted }}>Favoriler</div>
            <div className="chip-row">
              {favoriteContacts.map(contact => (
                <div key={contact.uid} className="chip-card" onClick={() => handleOpenRoom(contact)}>
                  <Avatar name={contact.name} size={54} photoUrl={contactPhotos[contact.uid]} online={isContactOnline(contact.uid)} />
                  <div className="chip-label" style={{ color: theme.text }}>{contact.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {onlineContacts.length > 0 && (
          <div className="contacts-section">
            <div className="contacts-section-title" style={{ color: theme.textMuted }}>Çevrimiçi</div>
            <div className="chip-row">
              {onlineContacts.map(contact => (
                <div key={contact.uid} className="chip-card" onClick={() => handleOpenRoom(contact)}>
                  <Avatar name={contact.name} size={54} photoUrl={contactPhotos[contact.uid]} online />
                  <div className="chip-label" style={{ color: theme.text }}>{contact.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="contacts-section-title" style={{ color: theme.textMuted, marginTop: 4 }}>Sohbetler</div>

        {recentConversations.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 40, fontSize: 13, color: theme.textFaint }}>
            Henüz kişin yok. Aşağıdan bir kullanıcı adı ile ekle.
          </div>
        )}

        {recentConversations.map(item => {
          const latest = latestMessages[item.uid];
          const lastReadAt = lastReadMap[item.uid] ?? 0;
          const isUnread = !!latest && latest.senderId !== account.uid && latest.createdAt > lastReadAt;
          return (
            <div
              key={item.uid}
              className="contact-row"
              style={{ background: theme.surface, borderColor: theme.border }}
              onClick={() => handleOpenRoom(item)}>
              <Avatar name={item.name} size={44} photoUrl={contactPhotos[item.uid]} online={isContactOnline(item.uid)} />
              <div className="contact-body">
                <div className="contact-name" style={{ color: theme.text }}>{item.name}</div>
                <div className="contact-preview" style={{ color: isUnread ? theme.text : theme.textMuted, fontWeight: isUnread ? 700 : 400 }}>
                  {formatPreview(latest, account.uid)}
                </div>
              </div>
              <div className="contact-meta">
                {latest && (
                  <div style={{ fontSize: 11.5, color: isUnread ? theme.identity : theme.textFaint, fontWeight: isUnread ? 700 : 400 }}>
                    {formatListTimestamp(latest.createdAt)}
                  </div>
                )}
                {isUnread && <div className="unread-dot" style={{ background: theme.identity }} />}
              </div>
              <button className="favorite-btn" onClick={e => handleToggleFavorite(e, item)}>
                <span style={{ color: item.favorite ? theme.accent : theme.textFaint, fontSize: 20 }}>{item.favorite ? '★' : '☆'}</span>
              </button>
              <button className="favorite-btn" title="Sohbeti sil" onClick={e => handleDeleteChat(e, item)}>
                <span style={{ color: theme.textFaint, fontSize: 18 }}>🗑️</span>
              </button>
            </div>
          );
        })}
      </div>
      )}

      {!(globalSearchOpen && globalSearchQuery.trim()) && (
      <button
        className="add-contact-btn"
        style={{ background: theme.accent, color: theme.accentText }}
        onClick={() => {
          setAddError(null);
          setUsernameDraft('');
          setNicknameDraft('');
          setAddModalOpen(true);
        }}>
        + Kişi Ekle
      </button>
      )}

      {addModalOpen && (
        <div className="modal-overlay" style={{ background: theme.overlay }} onClick={() => setAddModalOpen(false)}>
          <form className="modal-card" style={{ background: theme.surface, borderColor: theme.border }} onClick={e => e.stopPropagation()} onSubmit={handleAddContact}>
            <div className="modal-title" style={{ color: theme.text }}>Kişi Ekle</div>
            <input
              className="modal-input"
              style={{ background: theme.inputBackground, color: theme.text, borderColor: theme.border }}
              placeholder="Kullanıcı adı"
              value={usernameDraft}
              onChange={e => setUsernameDraft(e.target.value)}
              maxLength={20}
              disabled={adding}
              autoFocus
            />
            <input
              className="modal-input"
              style={{ background: theme.inputBackground, color: theme.text, borderColor: theme.border }}
              placeholder="Takma ad (opsiyonel)"
              value={nicknameDraft}
              onChange={e => setNicknameDraft(e.target.value)}
              maxLength={24}
              disabled={adding}
            />
            {addError && <div style={{ color: theme.danger, fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{addError}</div>}
            <button className="modal-submit" style={{ background: theme.accent, color: theme.accentText, opacity: adding ? 0.6 : 1 }} type="submit" disabled={adding}>
              {adding ? '...' : 'Ekle'}
            </button>
            <div style={{ marginTop: 14, textAlign: 'center', fontSize: 13, color: theme.textMuted, cursor: 'pointer' }} onClick={() => setAddModalOpen(false)}>
              Vazgeç
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default ContactsScreen;
