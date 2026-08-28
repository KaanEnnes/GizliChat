import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import type { ChatMessage } from '../services/chatService';
import AudioMessagePlayer from './AudioMessagePlayer';
import { useTheme } from '../theme/ThemeContext';
import { getCachedVideoUri } from '../services/videoCacheService';

/** Resolves a video message's remote URL to a locally-cached file path (see videoCacheService), downloading it at most once per device. */
function useCachedVideoUri(remoteUrl: string | undefined): string | undefined {
  const [uri, setUri] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!remoteUrl) {
      setUri(undefined);
      return;
    }
    let cancelled = false;
    setUri(remoteUrl); // stream the remote URL immediately while the cached copy downloads
    getCachedVideoUri(remoteUrl).then(cachedUri => {
      if (!cancelled) {
        setUri(cachedUri);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [remoteUrl]);

  return uri;
}

interface Props {
  message: ChatMessage;
  isMine: boolean;
  myUid: string;
  isPinned: boolean;
  onToggleReaction: (message: ChatMessage, emoji: string) => void;
  onPin: (message: ChatMessage) => void;
  onUnpin: () => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
}

const SWIPE_REPLY_THRESHOLD = 56;
const SWIPE_REPLY_MAX = 84;

const QUICK_EMOJIS = ['❤️', '🤍', '😂', '😮', '😢', '🙏', '👍'];

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function replyPreviewLabel(reply: NonNullable<ChatMessage['replyTo']>): string {
  switch (reply.type) {
    case 'image':
      return '📷 Fotoğraf';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return '🎤 Sesli mesaj';
    case 'call':
      return '📞 Arama';
    case 'chess':
      return '♟️ Satranç daveti';
    default:
      return reply.text;
  }
}

function formatCallDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function MessageBubble({
  message,
  isMine,
  myUid,
  isPinned,
  onToggleReaction,
  onPin,
  onUnpin,
  onEdit,
  onDelete,
  onReply,
}: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewedOnce, setViewedOnce] = useState(false);
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeIconOpacity = swipeX.interpolate({
    inputRange: [0, SWIPE_REPLY_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        !message.deleted &&
        message.type !== 'call' &&
        message.type !== 'chess' &&
        Math.abs(gesture.dx) > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dx > 0) {
          swipeX.setValue(Math.min(gesture.dx, SWIPE_REPLY_MAX));
        }
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx > SWIPE_REPLY_THRESHOLD) {
          onReply(message);
        }
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
      },
    }),
  ).current;
  const bubbleColor = isMine ? theme.bubbleMine : theme.bubbleOther;
  const bubbleTextColor = isMine ? theme.bubbleMineText : theme.bubbleOtherText;
  const myReaction = message.reactions?.[myUid];
  const reactionCounts = Object.values(message.reactions ?? {}).reduce<Record<string, number>>(
    (acc, emoji) => {
      acc[emoji] = (acc[emoji] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const hasReactions = Object.keys(reactionCounts).length > 0;
  const cachedVideoUri = useCachedVideoUri(message.type === 'video' ? message.mediaUrl : undefined);
  const status: 'pending' | 'sent' | 'delivered' | 'read' = message.pending
    ? 'pending'
    : message.readAt
    ? 'read'
    : message.deliveredAt
    ? 'delivered'
    : 'sent';

  const handlePickEmoji = (emoji: string) => {
    setPickerOpen(false);
    onToggleReaction(message, emoji);
  };

  const handleLongPress = () => {
    if (message.deleted) {
      return;
    }
    setPickerOpen(true);
  };

  const handlePin = () => {
    setPickerOpen(false);
    if (isPinned) {
      onUnpin();
    } else {
      onPin(message);
    }
  };

  const handleEdit = () => {
    setPickerOpen(false);
    onEdit(message);
  };

  const handleDelete = () => {
    setPickerOpen(false);
    onDelete(message);
  };

  // WhatsApp-style call log entry — centered, not a left/right chat bubble.
  if (message.type === 'call') {
    const missed = message.callStatus === 'missed';
    const icon = message.callVideo ? '🎥' : '📞';
    const kindLabel = message.callVideo ? 'Görüntülü arama' : 'Sesli arama';
    const directionIcon = isMine ? '↗' : '↙';
    const detail = missed
      ? isMine
        ? 'Cevap verilmedi'
        : 'Cevapsız arama'
      : formatCallDuration(message.durationSeconds ?? 0);

    return (
      <View style={styles.callRow}>
        <View
          style={[
            styles.callPill,
            { backgroundColor: theme.surface, borderColor: theme.border },
            missed && { backgroundColor: theme.dangerSoft, borderColor: theme.dangerSoft },
          ]}>
          <Text style={styles.callIcon}>{icon}</Text>
          <View style={styles.callTextWrap}>
            <Text style={[styles.callLabel, { color: theme.text }, missed && { color: theme.danger }]}>
              {kindLabel} {directionIcon}
            </Text>
            <Text style={[styles.callDetail, { color: theme.textMuted }]}>{detail}</Text>
          </View>
          <Text style={[styles.callTime, { color: theme.textFaint }]}>{formatTime(message.createdAt)}</Text>
        </View>
      </View>
    );
  }

  // Chess invite entry — centered like a call log, just informational.
  if (message.type === 'chess') {
    return (
      <View style={styles.callRow}>
        <View style={[styles.callPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.callIcon}>♟️</Text>
          <View style={styles.callTextWrap}>
            <Text style={[styles.callLabel, { color: theme.text }]}>
              {isMine ? 'Satranç daveti gönderdin' : 'Satranç daveti aldın'}
            </Text>
            <Text style={[styles.callDetail, { color: theme.textMuted }]}>Oynamak için oyun menüsünü aç</Text>
          </View>
          <Text style={[styles.callTime, { color: theme.textFaint }]}>{formatTime(message.createdAt)}</Text>
        </View>
      </View>
    );
  }

  // Soft-deleted — content is already cleared server-side, just show the placeholder.
  if (message.deleted) {
    return (
      <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
        <View style={[styles.bubble, styles.deletedBubble, { borderColor: theme.border }]}>
          <Text style={[styles.deletedText, { color: theme.textFaint }]}>🚫 Bu mesaj silindi</Text>
        </View>
      </View>
    );
  }

  const isHiddenImage = message.type === 'image' && !!message.hidden;

  const handleOpenHidden = () => {
    setViewedOnce(true);
    setViewerOpen(true);
  };

  return (
    <View
      style={[
        styles.row,
        isMine ? styles.rowRight : styles.rowLeft,
        hasReactions && styles.rowWithReactions,
      ]}
      {...panResponder.panHandlers}>
      {isPinned && (
        <Text style={[styles.pinnedTag, { color: theme.textFaint }]}>📌 Sabitlendi</Text>
      )}
      <Animated.View
        style={[styles.swipeReplyIcon, isMine ? { right: '20%' } : { left: '20%' }, { opacity: swipeIconOpacity }]}>
        <Text style={styles.swipeReplyIconText}>↩️</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: swipeX }] }}>
          <Pressable
            onLongPress={handleLongPress}
            delayLongPress={280}
            style={[
              styles.bubble,
              { backgroundColor: bubbleColor },
              isMine ? styles.bubbleMine : styles.bubbleOther,
            ]}>
            {message.replyTo && (
              <View style={[styles.replyQuote, { borderLeftColor: theme.accent, backgroundColor: theme.overlay }]}>
                <Text style={[styles.replyQuoteSender, { color: theme.accent }]} numberOfLines={1}>
                  {message.replyTo.senderId === myUid ? 'Sen' : 'O'}
                </Text>
                <Text style={[styles.replyQuoteText, { color: bubbleTextColor }]} numberOfLines={1}>
                  {replyPreviewLabel(message.replyTo)}
                </Text>
              </View>
            )}
            {message.type === 'image' && message.mediaUrl && isHiddenImage && (
          <Pressable
            onPress={handleOpenHidden}
            style={[styles.hiddenMediaPill, { backgroundColor: theme.surfaceAlt }]}
            accessibilityRole="button"
            accessibilityLabel="Gizli fotoğrafı göster">
            <Text style={styles.hiddenMediaIcon}>🙈</Text>
            <View style={styles.hiddenMediaTextWrap}>
              <Text style={[styles.hiddenMediaText, { color: theme.text }]}>Gizli Fotoğraf</Text>
              <Text style={[styles.hiddenMediaHint, { color: theme.textMuted }]}>
                {viewedOnce ? 'Tekrar görmek için dokun' : 'Görmek için dokun'}
              </Text>
            </View>
          </Pressable>
        )}

        {message.type === 'image' && message.mediaUrl && !isHiddenImage && (
          <Pressable onPress={() => setViewerOpen(true)}>
            <Image source={{ uri: message.mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
          </Pressable>
        )}

        {message.type === 'video' && cachedVideoUri && (
          <Pressable onPress={() => setViewerOpen(true)} style={styles.videoThumbWrap}>
            <Video
              source={{ uri: cachedVideoUri }}
              style={styles.mediaImage}
              paused
              muted
              resizeMode="cover"
              controls={false}
            />
            <View style={styles.playOverlay}>
              <Text style={styles.playOverlayIcon}>▶</Text>
            </View>
          </Pressable>
        )}

        {message.type === 'audio' && message.mediaUrl && (
          <AudioMessagePlayer
            uri={message.mediaUrl}
            durationSeconds={message.durationSeconds}
            textColor={bubbleTextColor}
          />
        )}

        {message.type === 'text' && <Text style={[styles.messageText, { color: bubbleTextColor }]}>{message.text}</Text>}

        <View style={styles.metaRow}>
          {!!message.editedAt && (
            <Text style={[styles.timeText, styles.mutedMeta, { color: bubbleTextColor }]}>düzenlendi · </Text>
          )}
          <Text style={[styles.timeText, styles.mutedMeta, { color: bubbleTextColor }]}>
            {formatTime(message.createdAt)}
          </Text>
          {isMine && (
            <Text
              style={[
                styles.statusIcon,
                styles.mutedMeta,
                { color: bubbleTextColor },
                status === 'read' && [styles.readMeta, { color: theme.success }],
              ]}>
              {status === 'pending' ? '🕒' : status === 'sent' ? '✓' : '✓✓'}
            </Text>
          )}
        </View>

        {hasReactions && (
          <View
            style={[
              styles.reactionBar,
              { backgroundColor: theme.surface, borderColor: theme.border },
              isMine ? styles.reactionBarMine : styles.reactionBarOther,
            ]}>
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <Text key={emoji} style={[styles.reactionPillText, { color: theme.text }]}>
                {emoji}
                {count > 1 ? ` ${count}` : ''}
              </Text>
            ))}
          </View>
        )}
          </Pressable>
      </Animated.View>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          style={[styles.pickerOverlay, { backgroundColor: theme.overlay }]}
          onPress={() => setPickerOpen(false)}>
          <View style={[styles.pickerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {QUICK_EMOJIS.map(emoji => (
              <Pressable
                key={emoji}
                style={styles.pickerEmojiButton}
                onPress={() => handlePickEmoji(emoji)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`${emoji} tepkisi ver`}>
                <Text style={[styles.pickerEmojiText, myReaction === emoji && styles.pickerEmojiTextActive]}>
                  {emoji}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.actionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Pressable
              style={styles.actionRow}
              onPress={() => {
                setPickerOpen(false);
                onReply(message);
              }}
              accessibilityRole="button"
              accessibilityLabel="Mesajı yanıtla">
              <Text style={[styles.actionRowText, { color: theme.text }]}>↩️  Yanıtla</Text>
            </Pressable>
            <Pressable
              style={styles.actionRow}
              onPress={handlePin}
              accessibilityRole="button"
              accessibilityLabel={isPinned ? 'Sabiti kaldır' : 'Mesajı sabitle'}>
              <Text style={[styles.actionRowText, { color: theme.text }]}>
                {isPinned ? '📌  Sabiti Kaldır' : '📌  Sabitle'}
              </Text>
            </Pressable>
            {isMine && message.type === 'text' && (
              <Pressable
                style={styles.actionRow}
                onPress={handleEdit}
                accessibilityRole="button"
                accessibilityLabel="Mesajı düzenle">
                <Text style={[styles.actionRowText, { color: theme.text }]}>✏️  Düzenle</Text>
              </Pressable>
            )}
            {isMine && (
              <Pressable
                style={styles.actionRow}
                onPress={handleDelete}
                accessibilityRole="button"
                accessibilityLabel="Mesajı sil">
                <Text style={[styles.actionRowText, { color: theme.danger }]}>🗑️  Sil</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      {(message.type === 'image' || message.type === 'video') && message.mediaUrl && (
        <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
          <Pressable style={styles.viewerOverlay} onPress={() => setViewerOpen(false)}>
            {message.type === 'image' ? (
              <Image source={{ uri: message.mediaUrl }} style={styles.viewerImage} resizeMode="contain" />
            ) : (
              cachedVideoUri && (
                <Video
                  source={{ uri: cachedVideoUri }}
                  style={styles.viewerImage}
                  controls
                  resizeMode="contain"
                />
              )
            )}
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    marginVertical: 3,
  },
  rowLeft: {
    alignItems: 'flex-start',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowWithReactions: {
    marginBottom: 14,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleMine: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderBottomLeftRadius: 4,
  },
  reactionBar: {
    position: 'absolute',
    bottom: -12,
    flexDirection: 'row',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    gap: 4,
  },
  reactionBarMine: {
    right: 8,
  },
  reactionBarOther: {
    left: 8,
  },
  reactionPillText: {
    fontSize: 12,
  },
  pickerOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pickerCard: {
    flexDirection: 'row',
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
  },
  pickerEmojiButton: {
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  pickerEmojiText: {
    fontSize: 26,
  },
  pickerEmojiTextActive: {
    opacity: 0.4,
  },
  actionCard: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 4,
    minWidth: 180,
    overflow: 'hidden',
  },
  actionRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionRowText: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  deletedBubble: {
    borderWidth: 1,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  deletedText: {
    fontSize: 13.5,
    fontStyle: 'italic',
  },
  pinnedTag: {
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  swipeReplyIcon: {
    position: 'absolute',
    top: '50%',
    marginTop: -12,
  },
  swipeReplyIconText: {
    fontSize: 20,
  },
  replyQuote: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  replyQuoteSender: {
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 1,
  },
  replyQuoteText: {
    fontSize: 12.5,
    opacity: 0.85,
  },
  hiddenMediaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 170,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hiddenMediaIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  hiddenMediaTextWrap: {
    flexShrink: 1,
  },
  hiddenMediaText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  hiddenMediaHint: {
    fontSize: 11.5,
    marginTop: 2,
  },
  messageText: {
    fontSize: 15.5,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeText: {
    fontSize: 11,
  },
  statusIcon: {
    fontSize: 11,
    marginLeft: 4,
  },
  mutedMeta: {
    opacity: 0.6,
  },
  readMeta: {
    opacity: 1,
  },
  mediaImage: {
    width: 220,
    height: 220,
    borderRadius: 10,
  },
  videoThumbWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(11,19,43,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlayIcon: {
    color: '#F8FAFC',
    fontSize: 18,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6,10,24,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '80%',
  },
  callRow: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 6,
  },
  callPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: '82%',
    borderWidth: 1,
  },
  callIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  callTextWrap: {
    marginRight: 10,
  },
  callLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  callDetail: {
    fontSize: 11.5,
    marginTop: 1,
  },
  callTime: {
    fontSize: 10.5,
  },
});

export default MessageBubble;
