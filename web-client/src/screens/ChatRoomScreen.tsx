import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteMessage,
  editMessage,
  fetchMessageById,
  getRoomId,
  INITIAL_MESSAGE_LIMIT,
  markMessageDelivered,
  markMessageRead,
  MESSAGE_LIMIT_STEP,
  pinMessage,
  sendFileMessage,
  sendMediaMessage,
  sendMessage,
  setMessageReaction,
  subscribeToMessages,
  subscribeToPinnedMessageId,
  unpinMessage,
  type ChatMessage,
} from '../services/chatService';
import { fileToDataUri, resizeImageToDataUri, uploadRoomMedia } from '../services/mediaService';
import { addVideoBytesUsed, subscribeToUserProfile, type Account } from '../services/userService';
import { markRoomRead } from '../services/readStatusService';
import { useTheme } from '../theme/ThemeContext';
import type { Contact } from '../services/contactService';
import Avatar from '../components/Avatar';
import MessageBubble, { replyPreviewLabel } from '../components/MessageBubble';
import GamesModal from '../components/GamesModal';
import GifPickerModal from '../components/GifPickerModal';
import type { GifResult } from '../services/gifService';

const IMAGE_DATA_URI_LIMIT = 900_000;

interface Props {
  account: Account;
  contact: Contact;
  onBack: () => void;
}

function ChatRoomScreen({ account, contact, onBack }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const roomId = getRoomId(account.uid, contact.uid);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<ChatMessage | null>(null);
  const [text, setText] = useState('');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ChatMessage | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [contactPhotoUrl, setContactPhotoUrl] = useState<string | undefined>(undefined);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const seenReadRef = useRef<Set<string>>(new Set());
  const nearBottomRef = useRef(true);

  useEffect(() => {
    return subscribeToUserProfile(contact.uid, profile => setContactPhotoUrl(profile.photoUrl));
  }, [contact.uid]);

  useEffect(() => {
    markRoomRead(roomId);
    const unsubscribe = subscribeToMessages(
      roomId,
      messageLimit,
      nextMessages => {
        setMessages(nextMessages);
        setError(null);
        // Mark incoming messages delivered/read once they're rendered in the open room.
        nextMessages.forEach(m => {
          if (m.senderId !== account.uid && !seenReadRef.current.has(m.id)) {
            seenReadRef.current.add(m.id);
            if (!m.deliveredAt) markMessageDelivered(roomId, m.id).catch(() => undefined);
            if (!m.readAt) markMessageRead(roomId, m.id).catch(() => undefined);
          }
        });
      },
      err => setError(`Sohbete bağlanılamadı: ${err.message}`),
    );
    return unsubscribe;
  }, [roomId, messageLimit, account.uid]);

  useEffect(() => {
    return subscribeToPinnedMessageId(roomId, setPinnedMessageId);
  }, [roomId]);

  useEffect(() => {
    if (!pinnedMessageId) {
      setPinnedMessage(null);
      return;
    }
    const fromLoaded = messages.find(m => m.id === pinnedMessageId);
    if (fromLoaded) {
      setPinnedMessage(fromLoaded);
      return;
    }
    fetchMessageById(roomId, pinnedMessageId).then(setPinnedMessage);
  }, [pinnedMessageId, messages, roomId]);

  const lastMessage = messages.length ? messages[messages.length - 1] : null;
  const lastMessageId = lastMessage?.id ?? null;
  const lastMessageIsMine = lastMessage?.senderId === account.uid;

  useEffect(() => {
    // A message I just sent should always snap the view to it, even if I'd scrolled up.
    if (nearBottomRef.current || lastMessageIsMine) {
      nearBottomRef.current = true;
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      setShowJumpToBottom(false);
    } else {
      setShowJumpToBottom(true);
    }
    // messages is a new array on every snapshot, but the query is capped at messageLimit,
    // so length alone doesn't change once the cap is hit — key off the last message instead.
  }, [lastMessageId, lastMessageIsMine]);

  useEffect(() => {
    nearBottomRef.current = true;
    setShowJumpToBottom(false);
  }, [roomId]);

  // Image/video bubbles finish loading after the initial scroll-to-bottom already ran,
  // which grows scrollHeight and leaves the view short of the true bottom — re-pin when that happens.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleMediaLoad = () => {
      if (nearBottomRef.current) {
        el.scrollTo({ top: el.scrollHeight });
      }
    };
    el.addEventListener('load', handleMediaLoad, true);
    el.addEventListener('loadedmetadata', handleMediaLoad, true);
    return () => {
      el.removeEventListener('load', handleMediaLoad, true);
      el.removeEventListener('loadedmetadata', handleMediaLoad, true);
    };
  }, []);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop < 60 && messageLimit < 300) {
      setMessageLimit(prev => Math.min(300, prev + MESSAGE_LIMIT_STEP));
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    nearBottomRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  }, [messageLimit]);

  const handleJumpToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    nearBottomRef.current = true;
    setShowJumpToBottom(false);
  }, []);

  const buildReplySnapshot = (message: ChatMessage): ChatMessage['replyTo'] => ({
    messageId: message.id,
    text: message.text,
    senderId: message.senderId,
    type: message.type,
  });

  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    try {
      if (editTarget) {
        await editMessage(roomId, editTarget.id, trimmed);
        setEditTarget(null);
      } else {
        await sendMessage(roomId, trimmed, account.uid, replyTarget ? buildReplySnapshot(replyTarget) : undefined);
        setReplyTarget(null);
      }
    } catch (err) {
      setError(`Mesaj gönderilemedi: ${(err as Error).message}`);
    }
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isGif = file.type === 'image/gif';
    const isVideo = file.type.startsWith('video/');
    setUploading('Gönderiliyor…');
    try {
      if (isVideo) {
        const { url, sizeBytes } = await uploadRoomMedia(roomId, 'video', file);
        await sendMediaMessage(roomId, account.uid, 'video', url);
        await addVideoBytesUsed(account.uid, sizeBytes);
      } else if (isGif) {
        // GIFs must never go through the JPEG canvas resize below — drawing
        // a GIF onto a <canvas> flattens it to a single static frame,
        // silently killing the animation. Sent as-is (inline if small enough
        // for a Firestore doc, otherwise uploaded to Storage like video).
        if (file.size <= IMAGE_DATA_URI_LIMIT) {
          const dataUri = await fileToDataUri(file);
          await sendMediaMessage(roomId, account.uid, 'image', dataUri);
        } else {
          const { url, sizeBytes } = await uploadRoomMedia(roomId, 'image', file);
          await sendMediaMessage(roomId, account.uid, 'image', url);
          await addVideoBytesUsed(account.uid, sizeBytes);
        }
      } else if (isImage) {
        const dataUri = await resizeImageToDataUri(file, 1280, 0.7);
        if (dataUri.length > IMAGE_DATA_URI_LIMIT) {
          setError('Fotoğraf çok büyük, daha düşük çözünürlüklü bir fotoğraf seç.');
        } else {
          await sendMediaMessage(roomId, account.uid, 'image', dataUri);
        }
      } else {
        // Generic file: small files inline, larger ones go to Storage.
        if (file.size <= IMAGE_DATA_URI_LIMIT) {
          const dataUri = await fileToDataUri(file);
          await sendFileMessage(roomId, account.uid, dataUri, file.name, file.size);
        } else {
          const { url, sizeBytes } = await uploadRoomMedia(roomId, 'file', file);
          await sendFileMessage(roomId, account.uid, url, file.name, sizeBytes);
          await addVideoBytesUsed(account.uid, sizeBytes);
        }
      }
    } catch (err) {
      setError(`Medya gönderilemedi: ${(err as Error).message}`);
    } finally {
      setUploading(null);
    }
  };

  const handleToggleReaction = (message: ChatMessage, emoji: string) => {
    const current = message.reactions?.[account.uid];
    setMessageReaction(roomId, message.id, account.uid, current === emoji ? null : emoji).catch(() => undefined);
  };

  const handlePin = (message: ChatMessage) => pinMessage(roomId, message.id).catch(() => undefined);
  const handleUnpin = () => unpinMessage(roomId).catch(() => undefined);
  const handleEdit = (message: ChatMessage) => {
    setEditTarget(message);
    setReplyTarget(null);
    setText(message.text);
  };
  const handleDelete = (message: ChatMessage) => {
    if (window.confirm('Bu mesajı silmek istediğine emin misin?')) {
      deleteMessage(roomId, message.id).catch(() => undefined);
    }
  };
  const handleReply = (message: ChatMessage) => {
    setReplyTarget(message);
    setEditTarget(null);
  };

  return (
    <div className="chat-room" style={{ background: theme.background }}>
      <div className="chat-room-header" style={{ borderColor: theme.border, background: theme.surface }}>
        <button className="icon-btn back-btn" style={{ background: theme.surfaceAlt, color: theme.text }} onClick={onBack}>
          ←
        </button>
        <Avatar name={contact.name} size={36} photoUrl={contactPhotoUrl} />
        <div className="chat-room-title" style={{ color: theme.text, flex: 1 }}>{contact.name}</div>
        <button className="icon-btn" style={{ background: theme.surfaceAlt, color: theme.text }} onClick={() => setGamesOpen(true)} title="Oyun oyna">
          🎮
        </button>
      </div>

      {gamesOpen && (
        <GamesModal
          roomId={roomId}
          myUid={account.uid}
          contactUid={contact.uid}
          contactName={contact.name}
          onClose={() => setGamesOpen(false)}
        />
      )}

      {gifPickerOpen && (
        <GifPickerModal
          onClose={() => setGifPickerOpen(false)}
          onSelect={(gif: GifResult) => {
            setGifPickerOpen(false);
            sendMediaMessage(roomId, account.uid, 'image', gif.fullUrl).catch(err =>
              setError(`GIF gönderilemedi: ${(err as Error).message}`),
            );
          }}
        />
      )}

      {pinnedMessage && (
        <div className="chat-pinned-bar" style={{ background: theme.surfaceAlt, borderColor: theme.border }}>
          <span style={{ color: theme.textMuted, fontSize: 12 }}>📌 {replyPreviewLabel(pinnedMessage)}</span>
          <span style={{ cursor: 'pointer', color: theme.textFaint, fontSize: 12 }} onClick={handleUnpin}>✕</span>
        </div>
      )}

      {error && (
        <div className="contacts-banner" style={{ background: theme.dangerSoft, color: theme.danger }}>
          {error}
        </div>
      )}

      <div className="chat-messages" ref={listRef} onScroll={handleScroll}>
        {messages.map(message => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={message.senderId === account.uid}
            myUid={account.uid}
            isPinned={message.id === pinnedMessageId}
            onToggleReaction={handleToggleReaction}
            onPin={handlePin}
            onUnpin={handleUnpin}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onReply={handleReply}
          />
        ))}
      </div>

      {showJumpToBottom && (
        <button
          type="button"
          className="chat-jump-to-bottom"
          style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}
          onClick={handleJumpToBottom}
          title="En alta git"
        >
          ↓
        </button>
      )}

      {uploading && <div className="chat-upload-status" style={{ color: theme.textMuted }}>{uploading}</div>}

      {(replyTarget || editTarget) && (
        <div className="chat-composer-context" style={{ background: theme.surfaceAlt, borderColor: theme.border }}>
          <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
            {editTarget ? '✏️ Düzenleniyor' : `↩️ ${contact.name}${replyTarget?.senderId === account.uid ? ' (sen)' : ''}`}
            {replyTarget && `: ${replyPreviewLabel(replyTarget)}`}
          </span>
          <span
            style={{ cursor: 'pointer', color: theme.textFaint }}
            onClick={() => {
              setReplyTarget(null);
              setEditTarget(null);
              setText('');
            }}>
            ✕
          </span>
        </div>
      )}

      <form className="chat-composer" style={{ borderColor: theme.border, background: theme.surface }} onSubmit={handleSendText}>
        <button type="button" className="icon-btn" style={{ background: theme.surfaceAlt, color: theme.text }} onClick={handlePickFile} title="Dosya/Fotoğraf/Video gönder">
          📎
        </button>
        <button type="button" className="icon-btn" style={{ background: theme.surfaceAlt, color: theme.text, fontSize: 11, fontWeight: 800 }} onClick={() => setGifPickerOpen(true)} title="GIF gönder">
          GIF
        </button>
        <input ref={fileInputRef} type="file" accept="image/*,video/*,.pdf,.zip,.doc,.docx" style={{ display: 'none' }} onChange={handleFileChange} />
        <input
          className="chat-composer-input"
          style={{ background: theme.inputBackground, color: theme.text, borderColor: theme.border }}
          type="text"
          placeholder="Mesaj yaz..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button className="chat-send-btn" style={{ background: theme.accent, color: theme.accentText }} type="submit">
          {editTarget ? 'Kaydet' : 'Gönder'}
        </button>
      </form>
    </div>
  );
}

export default ChatRoomScreen;
