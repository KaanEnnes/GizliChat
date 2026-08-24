import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Clipboard, Image, Linking, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import RNFS from 'react-native-fs';
import ReactNativeBlobUtil from 'react-native-blob-util';
import type { ChatMessage } from '../services/chatService';
import AudioMessagePlayer from './AudioMessagePlayer';
import { useTheme } from '../theme/ThemeContext';
import { getCachedVideoUri } from '../services/videoCacheService';
import LinkPreviewCard from './LinkPreviewCard';
import { extractSpotifyUrl } from '../utils/linkPreview';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Saves a received file (mediaUrl is either an inline base64 data: URI or a
 * Storage download URL) into the device's public Downloads collection so the
 * user can open it from their file manager. Android 10+ (scoped storage)
 * blocks plain File writes to a shared path like Downloads, so the file is
 * first staged in the app's own cache dir, then handed to
 * react-native-blob-util's MediaStore API to actually land it in Downloads —
 * a raw RNFS.writeFile straight to a public Downloads path would silently
 * fail (EACCES) on most real devices at this project's targetSdk (36).
 */
async function downloadFile(mediaUrl: string, fileName: string): Promise<void> {
  const stagingPath = `${RNFS.CachesDirectoryPath}/${Date.now()}-${fileName}`;
  if (mediaUrl.startsWith('data:')) {
    const base64 = mediaUrl.slice(mediaUrl.indexOf(',') + 1);
    await RNFS.writeFile(stagingPath, base64, 'base64');
  } else {
    await RNFS.downloadFile({ fromUrl: mediaUrl, toFile: stagingPath }).promise;
  }

  const dotIndex = fileName.lastIndexOf('.');
  const extension = dotIndex >= 0 ? fileName.slice(dotIndex + 1) : '';
  const mimeType = extension ? `application/${extension}` : 'application/octet-stream';

  await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
    { name: fileName, parentFolder: '', mimeType },
    'Download',
    stagingPath,
  );
  await RNFS.unlink(stagingPath).catch(() => undefined);
  Alert.alert('Dosya indirildi', `"${fileName}" İndirilenler klasörüne kaydedildi.`);
}

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
  /** Deletion system stays wired end-to-end — just not exposed as a button in the long-press menu right now. */
  onDelete: (message: ChatMessage) => void;
  onReply: (message: ChatMessage) => void;
}

const QUICK_EMOJIS = ['❤️', '🤍', '😂', '😮', '😢', '🙏', '👍'];
const TEXT_TRUNCATE_LENGTH = 400;

/** How far (px) a message must be dragged before releasing it triggers reply. */
const SWIPE_REPLY_THRESHOLD = 56;
/** Hard cap on how far the bubble visually follows the finger, past which it just resists. */
const SWIPE_MAX_DRAG = 84;

/** One-line preview shown inside a reply quote block for non-text message types, which have no `text`. */
export function replyPreviewLabel(message: ChatMessage): string {
  switch (message.type) {
    case 'image':
      return '📷 Fotoğraf';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return '🎤 Sesli mesaj';
    case 'file':
      return `📄 ${message.fileName || 'Dosya'}`;
    case 'call':
      return message.callVideo ? '🎥 Görüntülü arama' : '📞 Sesli arama';
    default:
      return message.deleted ? 'Bu mesaj silindi' : message.text;
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// A capturing group in the split pattern makes String.prototype.split
// interleave the matches themselves into the result at every odd index
// (["before", "match", "between", "match", "after"]) — so a part is a URL
// exactly when its index is odd, no separate stateful regex test needed.
const URL_SPLIT_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

/** Splits a text message's content around URLs, rendering each URL segment as a tappable link (opens in the device's default browser) while leaving plain text untouched. */
function renderTextWithLinks(text: string, color: string): React.ReactNode {
  const parts = text.split(URL_SPLIT_REGEX);
  if (parts.length === 1) {
    return text;
  }
  return parts.map((part, index) => {
    if (index % 2 === 0) {
      return part;
    }
    const url = part.startsWith('www.') ? `https://${part}` : part;
    return (
      <Text
        key={index}
        style={{ color, textDecorationLine: 'underline' }}
        onPress={() => Linking.openURL(url).catch(() => undefined)}>
        {part}
      </Text>
    );
  });
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
  const [revealed, setRevealed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeTriggered = useRef(false);
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

  const handleCopy = () => {
    setPickerOpen(false);
    Clipboard.setString(message.text);
  };

  const handleReply = () => {
    setPickerOpen(false);
    onReply(message);
  };

  // Swipe-left-or-right-to-reply, WhatsApp style: the bubble follows the
  // finger (clamped) and crossing SWIPE_REPLY_THRESHOLD fires onReply once
  // per gesture; releasing always springs the bubble back to rest.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderGrant: () => {
        swipeTriggered.current = false;
      },
      onPanResponderMove: (_evt, gesture) => {
        const clamped = Math.max(-SWIPE_MAX_DRAG, Math.min(SWIPE_MAX_DRAG, gesture.dx));
        swipeX.setValue(clamped);
        if (!swipeTriggered.current && Math.abs(gesture.dx) > SWIPE_REPLY_THRESHOLD) {
          swipeTriggered.current = true;
          onReply(message);
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
      },
      // Android: PanResponder defaults to blocking nested native touchables
      // (e.g. the audio play button, image/file Pressables) from becoming
      // the responder while this view is present in the tree, even when no
      // swipe is in progress — without this, only the most recently touched
      // bubble's inner Pressable stays tappable.
      onShouldBlockNativeResponder: () => false,
    }),
  ).current;

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

  const showHiddenOverlay = (message.type === 'image' || message.type === 'video') && message.hidden && !revealed;

  return (
    <View
      style={[
        styles.row,
        isMine ? styles.rowRight : styles.rowLeft,
        hasReactions && styles.rowWithReactions,
      ]}>
      {isPinned && (
        <Text style={[styles.pinnedTag, { color: theme.textFaint }]}>📌 Sabitlendi</Text>
      )}
      <View style={[styles.swipeWrap, isMine ? styles.swipeWrapMine : styles.swipeWrapOther]}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.swipeReplyIcon,
            isMine ? styles.swipeReplyIconRight : styles.swipeReplyIconLeft,
            {
              opacity: swipeX.interpolate({
                inputRange: [-SWIPE_MAX_DRAG, -SWIPE_REPLY_THRESHOLD, 0, SWIPE_REPLY_THRESHOLD, SWIPE_MAX_DRAG],
                outputRange: [1, 0, 0, 0, 1],
              }),
            },
          ]}>
          <Text style={styles.swipeReplyIconText}>↩️</Text>
        </Animated.View>
        <Animated.View
          {...panResponder.panHandlers}
          style={{ transform: [{ translateX: swipeX }] }}>
          <Pressable
            onLongPress={handleLongPress}
            delayLongPress={280}
            style={[
              styles.bubble,
              { backgroundColor: bubbleColor },
              isMine ? styles.bubbleMine : styles.bubbleOther,
            ]}>
            {message.replyTo && (
              <View
                style={[
                  styles.replyQuote,
                  { borderLeftColor: theme.identity, backgroundColor: theme.overlay },
                ]}>
                <Text style={[styles.replyQuoteText, { color: bubbleTextColor }]} numberOfLines={1}>
                  {replyPreviewLabel({ ...message.replyTo, id: '', createdAt: 0 } as ChatMessage)}
                </Text>
              </View>
            )}
        {(message.type === 'image' || message.type === 'video') && message.mediaUrl && showHiddenOverlay && (
          <Pressable
            onPress={() => setRevealed(true)}
            style={[styles.hiddenMediaBox, { backgroundColor: theme.surfaceAlt }]}
            accessibilityRole="button"
            accessibilityLabel={message.type === 'video' ? 'Gizli videoyu göster' : 'Gizli fotoğrafı göster'}>
            <Text style={styles.hiddenMediaIcon}>🙈</Text>
            <Text style={[styles.hiddenMediaText, { color: theme.text }]}>
              {message.type === 'video' ? 'Gizli Video' : 'Gizli Fotoğraf'}
            </Text>
            <Text style={[styles.hiddenMediaHint, { color: theme.textMuted }]}>Görmek için dokun</Text>
          </Pressable>
        )}

        {message.type === 'image' && message.mediaUrl && !showHiddenOverlay && (
          <Pressable onPress={() => setViewerOpen(true)}>
            <Image source={{ uri: message.mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
          </Pressable>
        )}

        {message.type === 'video' && cachedVideoUri && !showHiddenOverlay && (
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

        {message.type === 'file' && message.mediaUrl && (
          <Pressable
            style={styles.fileRow}
            disabled={downloading}
            onPress={async () => {
              setDownloading(true);
              try {
                await downloadFile(message.mediaUrl as string, message.fileName || 'dosya');
              } catch (error) {
                Alert.alert('Dosya indirilemedi', (error as Error).message);
              } finally {
                setDownloading(false);
              }
            }}>
            <Text style={styles.fileIcon}>{downloading ? '⏳' : '📄'}</Text>
            <View style={styles.fileTextWrap}>
              <Text style={[styles.fileName, { color: bubbleTextColor }]} numberOfLines={1}>
                {message.fileName || 'Dosya'}
              </Text>
              <Text style={[styles.fileSize, { color: bubbleTextColor }]}>
                {message.fileSize ? formatFileSize(message.fileSize) : ''} · {downloading ? 'İndiriliyor…' : 'İndirmek için dokun'}
              </Text>
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

        {message.type === 'text' && (() => {
          const isLong = message.text.length > TEXT_TRUNCATE_LENGTH;
          const displayText = isLong && !textExpanded ? `${message.text.slice(0, TEXT_TRUNCATE_LENGTH)}…` : message.text;
          const spotifyUrl = extractSpotifyUrl(message.text);
          return (
            <>
              <Text style={[styles.messageText, { color: bubbleTextColor }]}>
                {renderTextWithLinks(displayText, bubbleTextColor)}
              </Text>
              {isLong && (
                <Pressable
                  onPress={() => setTextExpanded(v => !v)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={textExpanded ? 'Daha az göster' : 'Daha fazlasını göster'}>
                  <Text style={[styles.showMoreText, { color: bubbleTextColor }]}>
                    {textExpanded ? 'Daha az göster' : 'Daha fazlası'}
                  </Text>
                </Pressable>
              )}
              {spotifyUrl && <LinkPreviewCard url={spotifyUrl} />}
            </>
          );
        })()}

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
      </View>

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
              onPress={handleReply}
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
            {message.type === 'text' && (
              <Pressable
                style={styles.actionRow}
                onPress={handleCopy}
                accessibilityRole="button"
                accessibilityLabel="Mesajı kopyala">
                <Text style={[styles.actionRowText, { color: theme.text }]}>📋  Kopyala</Text>
              </Pressable>
            )}
            {isMine && message.type === 'text' && (
              <Pressable
                style={styles.actionRow}
                onPress={handleEdit}
                accessibilityRole="button"
                accessibilityLabel="Mesajı düzenle">
                <Text style={[styles.actionRowText, { color: theme.text }]}>✏️  Düzenle</Text>
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
  swipeWrap: {
    justifyContent: 'center',
  },
  swipeWrapMine: {
    alignItems: 'flex-end',
  },
  swipeWrapOther: {
    alignItems: 'flex-start',
  },
  swipeReplyIcon: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
  },
  swipeReplyIconLeft: {
    left: -4,
  },
  swipeReplyIconRight: {
    right: -4,
  },
  swipeReplyIconText: {
    fontSize: 18,
  },
  replyQuote: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
  },
  replyQuoteText: {
    fontSize: 12.5,
    opacity: 0.85,
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
  hiddenMediaBox: {
    width: 220,
    height: 220,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenMediaIcon: {
    fontSize: 34,
    marginBottom: 8,
  },
  hiddenMediaText: {
    fontSize: 14,
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
  showMoreText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
    textDecorationLine: 'underline',
    opacity: 0.85,
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
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 220,
    minWidth: 160,
    paddingVertical: 2,
  },
  fileIcon: {
    fontSize: 26,
    marginRight: 10,
  },
  fileTextWrap: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '700',
  },
  fileSize: {
    fontSize: 11,
    opacity: 0.7,
    marginTop: 2,
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
