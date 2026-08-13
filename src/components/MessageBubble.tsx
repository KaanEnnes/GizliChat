import React, { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Video from 'react-native-video';
import type { ChatMessage } from '../services/chatService';
import AudioMessagePlayer from './AudioMessagePlayer';

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
  const [viewerOpen, setViewerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const tint = isMine ? '#0F1115' : '#3B7CFF';
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
        <View style={[styles.callPill, missed && styles.callPillMissed]}>
          <Text style={styles.callIcon}>{icon}</Text>
          <View style={styles.callTextWrap}>
            <Text style={[styles.callLabel, missed && styles.callLabelMissed]}>
              {kindLabel} {directionIcon}
            </Text>
            <Text style={styles.callDetail}>{detail}</Text>
          </View>
          <Text style={styles.callTime}>{formatTime(message.createdAt)}</Text>
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
        style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
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
            tint={tint}
          />
        )}

        {message.type === 'text' && <Text style={styles.messageText}>{message.text}</Text>}

        <View style={styles.metaRow}>
          <Text style={styles.timeText}>{formatTime(message.createdAt)}</Text>
          {isMine && (
            <Text style={[styles.statusIcon, status === 'read' && styles.statusIconRead]}>
              {status === 'pending' ? '🕒' : status === 'sent' ? '✓' : '✓✓'}
            </Text>
          )}
        </View>

        {hasReactions && (
          <View style={[styles.reactionBar, isMine ? styles.reactionBarMine : styles.reactionBarOther]}>
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <Text key={emoji} style={styles.reactionPillText}>
                {emoji}
                {count > 1 ? ` ${count}` : ''}
              </Text>
            ))}
          </View>
        )}
      </Pressable>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerCard}>
            {QUICK_EMOJIS.map(emoji => (
              <Pressable key={emoji} style={styles.pickerEmojiButton} onPress={() => handlePickEmoji(emoji)}>
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
    marginVertical: 4,
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
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  reactionBar: {
    position: 'absolute',
    bottom: -12,
    flexDirection: 'row',
    backgroundColor: '#1C1F26',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    color: '#F5F5F7',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,11,15,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  pickerCard: {
    flexDirection: 'row',
    backgroundColor: '#1C1F26',
    borderRadius: 28,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pickerEmojiButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pickerEmojiText: {
    fontSize: 26,
  },
  pickerEmojiTextActive: {
    opacity: 0.4,
  },
  bubbleOther: {
    backgroundColor: '#2A2D34',
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: '#3B7CFF',
    borderBottomRightRadius: 4,
  },
  messageText: {
    color: '#F5F5F7',
    fontSize: 15,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeText: {
    color: 'rgba(245,245,247,0.6)',
    fontSize: 11,
  },
  statusIcon: {
    color: 'rgba(245,245,247,0.6)',
    fontSize: 11,
    marginLeft: 4,
  },
  statusIconRead: {
    color: '#34B7F1',
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
    backgroundColor: 'rgba(15,17,21,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlayIcon: {
    color: '#F5F5F7',
    fontSize: 18,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
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
    backgroundColor: '#2A2D34',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: '82%',
  },
  callPillMissed: {
    backgroundColor: 'rgba(255,107,107,0.14)',
  },
  callIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  callTextWrap: {
    marginRight: 10,
  },
  callLabel: {
    color: '#F5F5F7',
    fontSize: 13,
    fontWeight: '700',
  },
  callLabelMissed: {
    color: '#FF6B6B',
  },
  callDetail: {
    color: 'rgba(245,245,247,0.55)',
    fontSize: 11.5,
    marginTop: 1,
  },
  callTime: {
    color: 'rgba(245,245,247,0.4)',
    fontSize: 10.5,
  },
});

export default MessageBubble;
