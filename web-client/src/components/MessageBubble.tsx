import React, { useState } from 'react';
import type { ChatMessage } from '../services/chatService';
import { useTheme } from '../theme/ThemeContext';
import LinkPreviewCard from './LinkPreviewCard';
import { extractSpotifyUrl } from '../utils/linkPreview';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function replyPreviewLabel(message: Pick<ChatMessage, 'type' | 'text' | 'fileName'>): string {
  switch (message.type) {
    case 'image':
      return '📷 Fotoğraf';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return '🎤 Sesli mesaj';
    case 'file':
      return `📄 ${message.fileName || 'Dosya'}`;
    default:
      return message.text;
  }
}

const QUICK_EMOJIS = ['❤️', '🤍', '😂', '😮', '😢', '🙏', '👍'];
const TEXT_TRUNCATE_LENGTH = 400;

interface Props {
  message: ChatMessage;
  isMine: boolean;
  myUid: string;
  isPinned: boolean;
  /** True while this is the currently-active search result (in-chat search) or the target of a jump from global search — briefly tints the bubble so the user can spot it. */
  highlighted?: boolean;
  onToggleReaction: (message: ChatMessage, emoji: string) => void;
  onPin: (message: ChatMessage) => void;
  onUnpin: () => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
  /** Scrolls the list to the original message a reply quote points at, when it's in the currently-loaded window. */
  onJumpToReply: (messageId: string) => void;
  /** Opens the room-wide swipeable image gallery starting at this message, instead of the single-image overlay below. */
  onImagePress: (messageId: string) => void;
}

function MessageBubble({ message, isMine, myUid, isPinned, highlighted, onToggleReaction, onPin, onUnpin, onEdit, onDelete, onReply, onJumpToReply, onImagePress }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);

  const bubbleColor = isMine ? theme.bubbleMine : theme.bubbleOther;
  const bubbleTextColor = isMine ? theme.bubbleMineText : theme.bubbleOtherText;
  const myReaction = message.reactions?.[myUid];
  const reactionCounts = Object.values(message.reactions ?? {}).reduce<Record<string, number>>((acc, emoji) => {
    acc[emoji] = (acc[emoji] ?? 0) + 1;
    return acc;
  }, {});
  const hasReactions = Object.keys(reactionCounts).length > 0;
  const status: 'pending' | 'sent' | 'delivered' | 'read' = message.pending ? 'pending' : message.readAt ? 'read' : message.deliveredAt ? 'delivered' : 'sent';

  if (message.type === 'call') {
    const missed = message.callStatus === 'missed';
    const kindLabel = message.callVideo ? 'Görüntülü arama' : 'Sesli arama';
    const detail = missed ? (isMine ? 'Cevap verilmedi' : 'Cevapsız arama') : `${message.durationSeconds ?? 0}s`;
    return (
      <div className="msg-call-row">
        <div className="msg-call-pill" style={{ background: missed ? theme.dangerSoft : theme.surface, borderColor: missed ? theme.dangerSoft : theme.border }}>
          <span style={{ fontSize: 18, marginRight: 10 }}>{message.callVideo ? '🎥' : '📞'}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: missed ? theme.danger : theme.text }}>{kindLabel} {isMine ? '↗' : '↙'}</div>
            <div style={{ fontSize: 11.5, color: theme.textMuted }}>{detail}</div>
          </div>
        </div>
      </div>
    );
  }

  // A deleted message (see ChatMessage.deleted) never reaches this component
  // — subscribeToMessages/subscribeToLatestMessage/searchMessagesInRoom in
  // chatService.ts already filter it out of the list for both room members
  // (the admin panel's AdminScreen.tsx is the one place that doesn't).

  return (
    <div id={`msg-${message.id}`} className={`msg-row ${isMine ? 'mine' : 'other'} ${hasReactions ? 'with-reactions' : ''}`}>
      {isPinned && <div className="msg-pinned-tag" style={{ color: theme.textFaint }}>📌 Sabitlendi</div>}
      <div
        className="msg-bubble"
        style={{
          background: bubbleColor,
          color: bubbleTextColor,
          position: 'relative',
          ...(highlighted ? { outline: `2px solid ${theme.identity}`, outlineOffset: 1 } : {}),
        }}
        onContextMenu={e => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        onDoubleClick={() => setMenuOpen(true)}>
        {message.replyTo && (
          <div
            className="msg-reply-quote"
            style={{ borderLeftColor: theme.identity, background: theme.overlay, cursor: 'pointer' }}
            onClick={e => {
              e.stopPropagation();
              onJumpToReply(message.replyTo!.messageId);
            }}
            title="Yanıtlanan mesaja git">
            {replyPreviewLabel(message.replyTo)}
          </div>
        )}

        {message.type === 'image' && message.mediaUrl && (
          <img src={message.mediaUrl} className="msg-media" onClick={() => onImagePress(message.id)} alt="" />
        )}

        {message.type === 'video' && message.mediaUrl && (
          <video src={message.mediaUrl} className="msg-media" controls />
        )}

        {message.type === 'audio' && (
          message.mediaUrl ? (
            <audio src={message.mediaUrl} controls className="msg-audio" />
          ) : (
            <div style={{ fontSize: 13, opacity: 0.7 }}>🎤 Sesli mesaj (çözülemedi)</div>
          )
        )}

        {message.type === 'file' && message.mediaUrl && (
          <a className="msg-file-row" href={message.mediaUrl} download={message.fileName} style={{ color: bubbleTextColor }}>
            <span style={{ fontSize: 26, marginRight: 10 }}>📄</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{message.fileName || 'Dosya'}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{message.fileSize ? formatFileSize(message.fileSize) : ''} · indirmek için tıkla</div>
            </div>
          </a>
        )}

        {message.type === 'text' && (() => {
          const isLong = message.text.length > TEXT_TRUNCATE_LENGTH;
          const displayText = isLong && !textExpanded ? `${message.text.slice(0, TEXT_TRUNCATE_LENGTH)}…` : message.text;
          const spotifyUrl = extractSpotifyUrl(message.text);
          return (
            <div style={{ fontSize: 15.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {displayText}
              {isLong && (
                <button
                  type="button"
                  className="msg-show-more-btn"
                  style={{ color: bubbleTextColor }}
                  onClick={() => setTextExpanded(v => !v)}>
                  {textExpanded ? 'Daha az göster' : 'Daha fazlası'}
                </button>
              )}
              {spotifyUrl && <LinkPreviewCard url={spotifyUrl} />}
            </div>
          );
        })()}

        <div className="msg-meta-row">
          {!!message.editedAt && <span style={{ opacity: 0.6, fontSize: 11 }}>düzenlendi · </span>}
          <span style={{ opacity: 0.6, fontSize: 11 }}>{formatTime(message.createdAt)}</span>
          {isMine && (
            <span style={{ fontSize: 11, marginLeft: 4, opacity: status === 'read' ? 1 : 0.6, color: status === 'read' ? theme.success : bubbleTextColor }}>
              {status === 'pending' ? '🕒' : status === 'sent' ? '✓' : '✓✓'}
            </span>
          )}
        </div>

        {hasReactions && (
          <div className={`msg-reaction-bar ${isMine ? 'mine' : 'other'}`} style={{ background: theme.surface, borderColor: theme.border }}>
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <span key={emoji} style={{ fontSize: 12, color: theme.text }}>
                {emoji}
                {count > 1 ? ` ${count}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {menuOpen && (
        <div className="msg-menu-overlay" onClick={() => setMenuOpen(false)}>
          <div className="msg-menu-card" style={{ background: theme.surface, borderColor: theme.border }} onClick={e => e.stopPropagation()}>
            <div className="msg-menu-emojis">
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  className="msg-menu-emoji-btn"
                  style={{ opacity: myReaction === emoji ? 0.4 : 1 }}
                  onClick={() => {
                    setMenuOpen(false);
                    onToggleReaction(message, emoji);
                  }}>
                  {emoji}
                </button>
              ))}
            </div>
            <button
              className="msg-menu-action"
              style={{ color: theme.text }}
              onClick={() => {
                setMenuOpen(false);
                onReply(message);
              }}>
              ↩️ Yanıtla
            </button>
            <button
              className="msg-menu-action"
              style={{ color: theme.text }}
              onClick={() => {
                setMenuOpen(false);
                isPinned ? onUnpin() : onPin(message);
              }}>
              {isPinned ? '📌 Sabiti Kaldır' : '📌 Sabitle'}
            </button>
            {isMine && message.type === 'text' && (
              <button
                className="msg-menu-action"
                style={{ color: theme.text }}
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(message);
                }}>
                ✏️ Düzenle
              </button>
            )}
            <button
              className="msg-menu-action"
              style={{ color: theme.danger }}
              onClick={() => {
                setMenuOpen(false);
                onDelete(message);
              }}>
              🗑️ Sil
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default MessageBubble;
