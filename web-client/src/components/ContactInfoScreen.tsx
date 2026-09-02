import React, { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeContext';
import Avatar from './Avatar';
import { replyPreviewLabel } from './MessageBubble';
import { fetchAllMedia, fetchStarredMessages, type ChatMessage } from '../services/chatService';
import { fetchAccountUsername, ONLINE_THRESHOLD_MS, subscribeToPresence } from '../services/userService';
import type { Contact } from '../services/contactService';

interface Props {
  contact: Contact;
  contactPhotoUrl?: string;
  myUid: string;
  roomId: string;
  onClose: () => void;
  onOpenSearch: () => void;
  onJumpToMessage: (messageId: string) => void;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString('tr-TR')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

/** WhatsApp-style "kişi bilgisi" screen — opened by tapping the contact's name/avatar in the chat header. No phone number exists in this app's data model (username/password auth, not phone-based), so the username stands in for it. */
function ContactInfoScreen({ contact, contactPhotoUrl, myUid, roomId, onClose, onOpenSearch, onJumpToMessage }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [view, setView] = useState<'info' | 'starred'>('info');
  const [lastActiveAt, setLastActiveAt] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [starred, setStarred] = useState<ChatMessage[] | null>(null);
  const [starredError, setStarredError] = useState<string | null>(null);
  const [mediaCount, setMediaCount] = useState<number | null>(null);

  useEffect(() => subscribeToPresence(contact.uid, setLastActiveAt), [contact.uid]);
  useEffect(() => {
    fetchAccountUsername(contact.uid).then(setUsername).catch(() => undefined);
  }, [contact.uid]);

  // Counts the room's ENTIRE media history, not just whatever page of
  // messages happens to be loaded in the open chat — that was the previous
  // bug here (see fetchAllMedia's doc comment): a room with older photos
  // outside the currently-loaded window showed "0" even when media existed.
  useEffect(() => {
    fetchAllMedia(roomId)
      .then(list => setMediaCount(list.length))
      .catch(() => setMediaCount(0));
  }, [roomId]);

  useEffect(() => {
    if (view !== 'starred' || starred !== null) {
      return;
    }
    fetchStarredMessages(roomId, myUid)
      .then(setStarred)
      .catch(err => setStarredError((err as Error).message));
  }, [view, starred, roomId, myUid]);

  const isOnline = lastActiveAt != null && Date.now() - lastActiveAt < ONLINE_THRESHOLD_MS;

  return (
    <div className="modal-overlay" style={{ background: theme.overlay }} onClick={onClose}>
      <div className="gif-picker-card" style={{ background: theme.surface, borderColor: theme.border, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header-row">
          <span className="modal-title-inline" style={{ color: theme.text }}>
            {view === 'starred' ? '⭐ Yıldızlı mesajlar' : 'Kişi bilgisi'}
          </span>
          <button className="modal-close-btn" style={{ color: theme.textMuted }} onClick={view === 'starred' ? () => setView('info') : onClose}>
            {view === 'starred' ? '↩' : '✕'}
          </button>
        </div>

        {view === 'info' && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0 8px' }}>
              <Avatar name={contact.name} size={96} photoUrl={contactPhotoUrl} />
              <div style={{ fontSize: 19, fontWeight: 700, color: theme.text, marginTop: 12 }}>{contact.name}</div>
              {!!username && <div style={{ fontSize: 13.5, color: theme.textMuted, marginTop: 2 }}>@{username}</div>}
              <div style={{ fontSize: 12.5, color: isOnline ? theme.success : theme.textFaint, marginTop: 4 }}>
                {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 28, padding: '12px 0' }}>
              <button
                onClick={onOpenSearch}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer' }}>
                <div style={{ width: 46, height: 46, borderRadius: 23, background: theme.surfaceAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  🔍
                </div>
                <span style={{ fontSize: 11.5, color: theme.text }}>Ara</span>
              </button>
            </div>

            <div style={{ borderTop: `1px solid ${theme.border}`, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px' }}>
                <span style={{ fontSize: 14, color: theme.text }}>📎 Medya, bağlantı ve belgeler</span>
                <span style={{ fontSize: 13.5, color: theme.textMuted }}>{mediaCount ?? '…'}</span>
              </div>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px', cursor: 'pointer' }}
                onClick={() => setView('starred')}>
                <span style={{ fontSize: 14, color: theme.text }}>⭐ Yıldızlı mesajlar</span>
                <span style={{ fontSize: 13.5, color: theme.textMuted }}>{starred?.length ?? '›'}</span>
              </div>
            </div>
          </>
        )}

        {view === 'starred' && (
          <div style={{ minHeight: 200 }}>
            {starredError && <div style={{ color: theme.danger, fontSize: 13, textAlign: 'center', padding: 24 }}>{starredError}</div>}
            {!starredError && starred === null && <div style={{ color: theme.textMuted, textAlign: 'center', padding: 24 }}>Yükleniyor…</div>}
            {!starredError && starred?.length === 0 && (
              <div style={{ color: theme.textFaint, fontSize: 13, textAlign: 'center', padding: 24 }}>Henüz yıldızlanmış mesaj yok.</div>
            )}
            {starred?.map(message => (
              <div
                key={message.id}
                onClick={() => {
                  onJumpToMessage(message.id);
                  onClose();
                }}
                style={{ padding: '10px 4px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer' }}>
                <div style={{ fontSize: 13.5, color: theme.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {replyPreviewLabel(message)}
                </div>
                <div style={{ fontSize: 11.5, color: theme.textFaint, marginTop: 2 }}>
                  {message.senderId === myUid ? 'Sen' : contact.name} · {formatTime(message.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ContactInfoScreen;
