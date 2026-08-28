import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useTheme } from '../theme/ThemeContext';
import { getRoomId, subscribeToMessages, type ChatMessage } from '../services/chatService';
import type { Account } from '../services/userService';

interface AdminUser {
  uid: string;
  username: string;
}

interface Props {
  account: Account;
  onLogout: () => void;
}

/**
 * Minimal, read-only admin panel — the practical side of this app's
 * openly-disclosed admin-access model (see ObsidianVault/Changelog.md and
 * every chat room's "🔒 Bu sohbet yönetici hesabı tarafından da
 * görüntülenebilir" banner). Lets the admin account pick any two registered
 * users and view the messages between them, decrypted with the admin's own
 * E2E key pair via the third `encTextAdmin`/`encNonceAdmin`-family copy
 * every client now encrypts alongside the normal self/peer copies (see
 * chatService.ts's buildAdminFieldGroup and its docToMessage/
 * buildDecryptContext admin branch).
 *
 * Deliberately minimal: no send/reply/media-upload/reactions/edit/delete —
 * this is an internal visibility tool, not a second full chat client, and
 * firestore.rules only grants the admin account `read` on rooms/messages
 * anyway (see isAdmin()), so nothing here could write even if it tried.
 */
function AdminScreen({ account, onLogout }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [uidA, setUidA] = useState('');
  const [uidB, setUidB] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'users'))
      .then(snap => {
        const list = snap.docs
          .map(d => ({ uid: d.id, username: typeof d.data().username === 'string' ? (d.data().username as string) : d.id }))
          .sort((a, b) => a.username.localeCompare(b.username, 'tr'));
        setUsers(list);
      })
      .catch(err => setUsersError(`Kullanıcı listesi alınamadı: ${(err as Error).message}`));
  }, []);

  const roomId = uidA && uidB && uidA !== uidB ? getRoomId(uidA, uidB) : null;

  useEffect(() => {
    if (!roomId) {
      setMessages([]);
      setRoomError(null);
      return undefined;
    }
    setRoomError(null);
    const unsubscribe = subscribeToMessages(
      roomId,
      200,
      account.uid,
      setMessages,
      err => setRoomError(`Sohbet yüklenemedi: ${err.message}`),
    );
    return unsubscribe;
  }, [roomId, account.uid]);

  const nameFor = (uid: string) => users.find(u => u.uid === uid)?.username ?? uid;

  const renderContent = (message: ChatMessage): React.ReactNode => {
    if (message.deletedFor?.length && message.type === 'text' && !message.text) {
      return <i style={{ opacity: 0.6 }}>(boş)</i>;
    }
    switch (message.type) {
      case 'image':
        return message.mediaUrl ? (
          <img src={message.mediaUrl} alt="" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 8, display: 'block' }} />
        ) : (
          <i style={{ opacity: 0.6 }}>📷 Fotoğraf (çözülemedi)</i>
        );
      case 'audio':
        return message.mediaUrl ? <audio src={message.mediaUrl} controls /> : <i style={{ opacity: 0.6 }}>🎤 Sesli mesaj (çözülemedi)</i>;
      case 'video':
        return message.mediaUrl ? (
          <video src={message.mediaUrl} controls style={{ maxWidth: 260, borderRadius: 8 }} />
        ) : (
          <i style={{ opacity: 0.6 }}>🎥 Video</i>
        );
      case 'file':
        return <span>📎 {message.fileName ?? 'Dosya'}</span>;
      case 'call':
        return <span>📞 Arama ({message.callStatus === 'missed' ? 'cevapsız' : 'tamamlandı'})</span>;
      default:
        return <span>{message.text}</span>;
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: theme.background, color: theme.text }}>
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Yönetici Paneli</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            Salt okunur — bu görünüm sadece görüntüleme içindir, gönderme/düzenleme yok.
          </div>
        </div>
        <button
          onClick={onLogout}
          style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Çıkış
        </button>
      </div>

      <div
        style={{
          padding: '14px 18px',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          borderBottom: `1px solid ${theme.border}`,
          background: theme.surface,
        }}>
        <select
          value={uidA}
          onChange={e => setUidA(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBackground, color: theme.text }}>
          <option value="">Kullanıcı 1 seç…</option>
          {users.map(u => (
            <option key={u.uid} value={u.uid}>
              {u.username}
            </option>
          ))}
        </select>
        <span style={{ color: theme.textFaint }}>↔</span>
        <select
          value={uidB}
          onChange={e => setUidB(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.inputBackground, color: theme.text }}>
          <option value="">Kullanıcı 2 seç…</option>
          {users.map(u => (
            <option key={u.uid} value={u.uid}>
              {u.username}
            </option>
          ))}
        </select>
        {usersError && <span style={{ color: theme.danger, fontSize: 12.5 }}>{usersError}</span>}
      </div>

      {roomError && (
        <div style={{ padding: '8px 18px', background: theme.dangerSoft, color: theme.danger, fontSize: 12.5 }}>{roomError}</div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {!roomId && <div style={{ color: theme.textFaint, fontSize: 13 }}>Görüntülemek için iki farklı kullanıcı seç.</div>}
        {roomId && messages.length === 0 && !roomError && (
          <div style={{ color: theme.textFaint, fontSize: 13 }}>Bu iki kullanıcı arasında henüz mesaj yok.</div>
        )}
        {messages.map(message => (
          <div key={message.id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: theme.textMuted, marginBottom: 3 }}>
              {nameFor(message.senderId)} · {new Date(message.createdAt).toLocaleString('tr-TR')}
            </div>
            <div
              style={{
                display: 'inline-block',
                maxWidth: '70%',
                padding: '8px 12px',
                borderRadius: 12,
                background: theme.surfaceAlt,
                border: `1px solid ${theme.border}`,
                fontSize: 13.5,
                lineHeight: 1.4,
              }}>
              {renderContent(message)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminScreen;
