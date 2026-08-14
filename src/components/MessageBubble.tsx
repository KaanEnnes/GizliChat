import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import type { ChatMessage } from '../services/chatService';
import AudioMessagePlayer from './AudioMessagePlayer';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  message: ChatMessage;
  isMine: boolean;
  myUid: string;
  onToggleReaction: (message: ChatMessage, emoji: string) => void;
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

function MessageBubble({ message, isMine, myUid, onToggleReaction }: Props): React.JSX.Element {
  const { theme } = useTheme();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
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

  return (
    <View
      style={[
        styles.row,
        isMine ? styles.rowRight : styles.rowLeft,
        hasReactions && styles.rowWithReactions,
      ]}>
      <Pressable
        onLongPress={() => setPickerOpen(true)}
        delayLongPress={280}
        style={[
          styles.bubble,
          { backgroundColor: bubbleColor },
          isMine ? styles.bubbleMine : styles.bubbleOther,
        ]}>
        {message.type === 'image' && message.mediaUrl && (
          <Pressable onPress={() => setViewerOpen(true)}>
            <Image source={{ uri: message.mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
          </Pressable>
        )}

        {message.type === 'video' && message.mediaUrl && (
          <Pressable onPress={() => setViewerOpen(true)} style={styles.videoThumbWrap}>
            <Video
              source={{ uri: message.mediaUrl }}
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
        </Pressable>
      </Modal>

      {(message.type === 'image' || message.type === 'video') && message.mediaUrl && (
        <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
          <Pressable style={styles.viewerOverlay} onPress={() => setViewerOpen(false)}>
            {message.type === 'image' ? (
              <Image source={{ uri: message.mediaUrl }} style={styles.viewerImage} resizeMode="contain" />
            ) : (
              <Video
                source={{ uri: message.mediaUrl }}
                style={styles.viewerImage}
                controls
                resizeMode="contain"
              />
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
