import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MessageBubble from '../components/MessageBubble';
import { Contact } from '../services/contactService';
import { ChatMessage, getRoomId, sendMessage, subscribeToMessages } from '../services/chatService';

interface Props {
  myUid: string;
  contact: Contact;
  onBack: () => void;
}

function ChatRoomScreen({ myUid, contact, onBack }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const roomId = getRoomId(myUid, contact.uid);

  useEffect(() => {
    const unsubscribe = subscribeToMessages(
      roomId,
      nextMessages => {
        setMessages(nextMessages);
        setConnectionError(null);
      },
      error => {
        setConnectionError(`Sohbete bağlanılamadı: ${error.message}`);
      },
    );

    return unsubscribe;
  }, [roomId]);

  useEffect(() => {
    if (messages.length > 0) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [messages.length]);

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed || sending) {
      return;
    }
    setDraft('');
    setSending(true);
    sendMessage(roomId, trimmed, myUid)
      .catch(error => {
        setConnectionError(`Mesaj gönderilemedi: ${error.message}`);
      })
      .finally(() => {
        setSending(false);
      });
  }, [draft, sending, roomId, myUid]);

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {contact.name}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {connectionError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{connectionError}</Text>
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} isMine={item.senderId === myUid} />
        )}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          placeholder="Mesaj yaz..."
          placeholderTextColor="rgba(245,245,247,0.4)"
          value={draft}
          onChangeText={setDraft}
          multiline
          onSubmitEditing={Platform.OS === 'ios' ? handleSend : undefined}
        />
        <Pressable
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}>
          {sending ? (
            <ActivityIndicator color="#0F1115" size="small" />
          ) : (
            <Text style={styles.sendButtonText}>Gönder</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1115',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backText: {
    color: 'rgba(245,245,247,0.7)',
    fontSize: 26,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    color: '#F5F5F7',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 34,
  },
  errorBanner: {
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,107,107,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorBannerText: {
    color: '#FF6B6B',
    fontSize: 12.5,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0F1115',
  },
  input: {
    flex: 1,
    backgroundColor: '#1C1F26',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#F5F5F7',
    fontSize: 15,
    maxHeight: 120,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sendButton: {
    backgroundColor: '#3B7CFF',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#0F1115',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ChatRoomScreen;
