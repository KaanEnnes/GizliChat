import React, { useEffect, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import RNFS from 'react-native-fs';
import ReactNativeBlobUtil from 'react-native-blob-util';
import type { ChatMessage } from '../services/chatService';
import AudioMessagePlayer from './AudioMessagePlayer';
import { useTheme } from '../theme/ThemeContext';
import { getCachedVideoUri } from '../services/videoCacheService';

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
  onDelete: (message: ChatMessage) => void;
}

const QUICK_EMOJIS = ['❤️', '🤍', '😂', '😮', '😢', '🙏', '👍'];

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
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
}: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [downloading, setDownloading] = useState(false);
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
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={280}
        style={[
          styles.bubble,
          { backgroundColor: bubbleColor },
          isMine ? styles.bubbleMine : styles.bubbleOther,
        ]}>
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
