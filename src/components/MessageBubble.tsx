import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '../services/chatService';

interface Props {
  message: ChatMessage;
  isMine: boolean;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function MessageBubble({ message, isMine }: Props): React.JSX.Element {
  return (
    <View style={[styles.row, isMine ? styles.rowRight : styles.rowLeft]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
        <Text style={styles.messageText}>{message.text}</Text>
        <Text style={styles.timeText}>{formatTime(message.createdAt)}</Text>
      </View>
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
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
  timeText: {
    color: 'rgba(245,245,247,0.6)',
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
});

export default MessageBubble;
