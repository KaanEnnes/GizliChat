import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import Sound from 'react-native-nitro-sound';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MessageBubble from '../components/MessageBubble';
import RecordingWaveform from '../components/RecordingWaveform';
import { Contact } from '../services/contactService';
import {
  ChatMessage,
  getRoomId,
  INITIAL_MESSAGE_LIMIT,
  markMessageRead,
  MAX_MESSAGE_LIMIT,
  MESSAGE_LIMIT_STEP,
  sendMediaMessage,
  sendMessage,
  setMessageReaction,
  subscribeToMessages,
} from '../services/chatService';
import { localFileToDataUri, uploadRoomMedia } from '../services/mediaService';
import { startVoiceCall, startVideoCall } from '../services/callService';
import { requestMicrophonePermission } from '../services/permissionsService';
import { markRoomRead } from '../services/readStatusService';
import { useTheme } from '../theme/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface Props {
  myUid: string;
  myUsername: string;
  contact: Contact;
  onBack: () => void;
}

// Firestore'un tek doküman limiti 1 MiB — base64 encoding ham veriyi ~%33
// büyüttüğü için bu eşik, diğer mesaj alanları için de pay bırakacak
// şekilde 900.000 karakterde (data URI önekiyle birlikte) tutuluyor.
const MAX_INLINE_MEDIA_DATA_URI_LENGTH = 900_000;
// MediaRecorder.stop() throws natively if called too soon after start() —
// below this, we treat the press as an accidental tap, not a real message.
const MIN_RECORDING_MS = 600;

function ChatRoomScreen({ myUid, myUsername, contact, onBack }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isOnline = useNetworkStatus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);
  const [draft, setDraft] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // If the screen is left (back button, incoming call, ...) mid-recording,
  // the native recorder was previously left running with an orphaned
  // listener — nothing ever called stopRecorder()/removeRecordBackListener()
  // for it, since handleStopRecording only runs on a normal mic-button release.
  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        Sound.removeRecordBackListener();
        Sound.stopRecorder().catch(() => undefined);
      }
    };
  }, []);

  const roomId = getRoomId(myUid, contact.uid);

  // Opening a different contact's room starts back at the most recent 20
  // messages rather than carrying over how far the previous room was paged.
  useEffect(() => {
    setMessageLimit(INITIAL_MESSAGE_LIMIT);
    setReachedStart(false);
    lastMessageIdRef.current = null;
  }, [roomId]);

  useEffect(() => {
    const unsubscribe = subscribeToMessages(
      roomId,
      messageLimit,
      nextMessages => {
        setMessages(nextMessages);
        setConnectionError(null);
        // Firestore returned fewer messages than we asked for — that's the
        // whole room history, no point asking for more on further scroll-up.
        setReachedStart(nextMessages.length < messageLimit);
        setLoadingMore(false);
      },
      error => {
        setConnectionError(`Sohbete bağlanılamadı: ${error.message}`);
        setLoadingMore(false);
      },
    );

    return unsubscribe;
  }, [roomId, messageLimit]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || reachedStart || messageLimit >= MAX_MESSAGE_LIMIT) {
      return;
    }
    setLoadingMore(true);
    setMessageLimit(prev => Math.min(prev + MESSAGE_LIMIT_STEP, MAX_MESSAGE_LIMIT));
  }, [loadingMore, reachedStart, messageLimit]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (event.nativeEvent.contentOffset.y < 60) {
        handleLoadMore();
      }
    },
    [handleLoadMore],
  );

  useEffect(() => {
    // Room is open, so every incoming message from the other person is being
    // shown on screen right now — write the shared read receipt (visible to
    // the sender as blue double ticks) for any of their messages that don't
    // have one yet. Already-read messages are skipped, so this doesn't loop.
    messages.forEach(message => {
      if (message.senderId !== myUid && message.type !== 'call' && !message.readAt) {
        markMessageRead(roomId, message.id).catch(() => undefined);
      }
    });
  }, [messages, roomId, myUid]);

  useEffect(() => {
    // Only jump to the bottom when the newest message actually changed (a
    // fresh incoming/outgoing message) — not when older messages get
    // prepended by scrolling up for more history, which would otherwise yank
    // the view back down every time a page of history loads.
    const lastId = messages.length > 0 ? messages[messages.length - 1].id : null;
    if (lastId !== null && lastId !== lastMessageIdRef.current) {
      const animate = lastMessageIdRef.current !== null;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: animate });
      });
    }
    lastMessageIdRef.current = lastId;
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      // Room is open and rendering these messages right now, so mark them
      // read as they arrive — keeps the contacts list unread badge accurate
      // without waiting for the user to leave and re-enter the room.
      markRoomRead(roomId, messages[messages.length - 1].createdAt);
    }
  }, [messages, roomId]);

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

  const handlePickMedia = useCallback(
    (source: 'library' | 'camera') => {
      const pickerFn = source === 'library' ? launchImageLibrary : launchCamera;
      pickerFn(
        { mediaType: 'mixed', quality: 0.7, maxWidth: 1280, maxHeight: 1280, includeBase64: true },
        async result => {
          if (result.didCancel || !result.assets || result.assets.length === 0) {
            return;
          }
          const asset = result.assets[0];
          if (!asset.uri) {
            return;
          }
          const isVideo = (asset.type || '').startsWith('video');

          // Fotoğraflar Firebase Storage'a hiç dokunmadan, sıkıştırılmış
          // base64 data URI olarak doğrudan Firestore mesaj dokümanına
          // yazılıyor (Blaze plana geçmeye gerek kalmadan çalışsın diye).
          // Video için bu mümkün değil (Firestore doküman limiti 1 MiB),
          // o yüzden video hâlâ Storage üzerinden yükleniyor.
          if (!isVideo && asset.base64) {
            const dataUri = `data:${asset.type || 'image/jpeg'};base64,${asset.base64}`;
            if (dataUri.length > MAX_INLINE_MEDIA_DATA_URI_LENGTH) {
              setConnectionError('Fotoğraf çok büyük, daha düşük çözünürlüklü bir fotoğraf seç.');
              return;
            }
            setUploadingMedia(true);
            try {
              await sendMediaMessage(roomId, myUid, 'image', dataUri);
            } catch (error) {
              setConnectionError(`Fotoğraf gönderilemedi: ${(error as Error).message}`);
            } finally {
              setUploadingMedia(false);
            }
            return;
          }

          const extension = isVideo ? 'mp4' : 'jpg';
          setUploadingMedia(true);
          try {
            const mediaUrl = await uploadRoomMedia(roomId, isVideo ? 'video' : 'image', asset.uri, extension);
            await sendMediaMessage(roomId, myUid, isVideo ? 'video' : 'image', mediaUrl);
          } catch (error) {
            setConnectionError(`Medya gönderilemedi: ${(error as Error).message}`);
          } finally {
            setUploadingMedia(false);
          }
        },
      );
    },
    [roomId, myUid],
  );

  const handleAttachPress = useCallback(() => {
    Alert.alert('Medya Gönder', undefined, [
      { text: 'Galeri', onPress: () => handlePickMedia('library') },
      { text: 'Kamera', onPress: () => handlePickMedia('camera') },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }, [handlePickMedia]);

  const handleStartRecording = useCallback(async () => {
    const granted = await requestMicrophonePermission();
    if (!granted) {
      setConnectionError('Sesli mesaj için mikrofon izni gerekiyor.');
      return;
    }
    try {
      await Sound.startRecorder(undefined, undefined, true);
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingLevel(0);
      Sound.addRecordBackListener(status => {
        const db = status.currentMetering ?? -60;
        setRecordingLevel(Math.min(1, Math.max(0, (db + 60) / 60)));
      });
    } catch (error) {
      setConnectionError(`Kayıt başlatılamadı: ${(error as Error).message}`);
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    if (!isRecording) {
      return;
    }
    setIsRecording(false);
    setRecordingLevel(0);
    Sound.removeRecordBackListener();
    const startedAt = recordingStartedAtRef.current ?? Date.now();
    const heldMs = Date.now() - startedAt;

    // MediaRecorder.stop() throws a native RuntimeException ("stop failed")
    // when no audio data was actually captured — this happens on a very
    // quick tap (recorder never gets a chance to write anything) and, more
    // fundamentally, on some emulators with no real microphone wired to the
    // host. Below MIN_RECORDING_MS we skip stopRecorder() entirely and show
    // a hint instead of surfacing that raw native stack trace.
    if (heldMs < MIN_RECORDING_MS) {
      Sound.stopRecorder().catch(() => undefined);
      setConnectionError('Kayıt çok kısa oldu, mikrofon butonunu biraz daha basılı tut.');
      return;
    }

    try {
      const uri = await Sound.stopRecorder();
      const durationSeconds = Math.max(1, Math.round(heldMs / 1000));
      setUploadingMedia(true);
      // Sesli mesajlar da fotoğraflar gibi Firebase Storage'a hiç
      // uğramıyor — inline base64 data URI olarak Firestore'a yazılıyor
      // (Storage, Blaze plana geçmeyi gerektirir, bu proje ondan kaçınıyor).
      const dataUri = await localFileToDataUri(uri);
      if (dataUri.length > MAX_INLINE_MEDIA_DATA_URI_LENGTH) {
        setConnectionError('Sesli mesaj çok uzun, daha kısa bir mesaj kaydet.');
        return;
      }
      await sendMediaMessage(roomId, myUid, 'audio', dataUri, durationSeconds);
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (message.includes('stop failed')) {
        setConnectionError(
          'Kayıt alınamadı — mikrofon bu cihazda/emülatörde ses yakalayamadı. Gerçek bir telefonda tekrar dene.',
        );
      } else {
        setConnectionError(`Sesli mesaj gönderilemedi: ${message}`);
      }
    } finally {
      setUploadingMedia(false);
    }
  }, [isRecording, roomId, myUid]);

  const handleToggleReaction = useCallback(
    (message: ChatMessage, emoji: string) => {
      const current = message.reactions?.[myUid];
      setMessageReaction(roomId, message.id, myUid, current === emoji ? null : emoji).catch(error => {
        setConnectionError(`Tepki eklenemedi: ${(error as Error).message}`);
      });
    },
    [roomId, myUid],
  );

  const canSend = draft.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      <View style={[styles.header, { borderBottomColor: theme.border, paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
          <Text style={[styles.backText, { color: theme.textMuted }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <Pressable
          onPress={() => {
            startVoiceCall(myUid, myUsername, contact).catch(error => {
              setConnectionError(`Arama başlatılamadı: ${(error as Error).message}`);
            });
          }}
          hitSlop={8}
          style={styles.headerIconButton}>
          <Text style={styles.headerIconText}>📞</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            startVideoCall(myUid, myUsername, contact).catch(error => {
              setConnectionError(`Arama başlatılamadı: ${(error as Error).message}`);
            });
          }}
          hitSlop={8}
          style={styles.headerIconButton}>
          <Text style={styles.headerIconText}>🎥</Text>
        </Pressable>
      </View>

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>📡 İnternet bağlantısı yok</Text>
        </View>
      )}

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
          <MessageBubble
            message={item}
            isMine={item.senderId === myUid}
            myUid={myUid}
            onToggleReaction={handleToggleReaction}
          />
        )}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={100}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        ListHeaderComponent={
          loadingMore ? (
            <View style={styles.loadingMoreRow}>
              <ActivityIndicator color={theme.textFaint} size="small" />
            </View>
          ) : undefined
        }
      />

      {uploadingMedia && (
        <View style={styles.uploadingBanner}>
          <ActivityIndicator color="#3B7CFF" size="small" />
          <Text style={styles.uploadingBannerText}>Gönderiliyor…</Text>
        </View>
      )}

      {isRecording && (
        <View style={styles.recordingBanner}>
          <View style={styles.recordingDot} />
          <RecordingWaveform level={recordingLevel} />
        </View>
      )}

      <View
        style={[
          styles.inputBar,
          { backgroundColor: theme.background, borderTopColor: theme.border },
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}>
        <Pressable onPress={handleAttachPress} hitSlop={8} style={styles.attachButton} disabled={uploadingMedia}>
          <Text style={styles.attachIcon}>📎</Text>
        </Pressable>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border },
          ]}
          placeholder="Mesaj yaz..."
          placeholderTextColor={theme.textFaint}
          value={draft}
          onChangeText={setDraft}
          multiline
          onSubmitEditing={Platform.OS === 'ios' ? handleSend : undefined}
        />
        {canSend ? (
          <Pressable style={styles.sendButton} onPress={handleSend} disabled={sending}>
            {sending ? (
              <ActivityIndicator color="#0F1115" size="small" />
            ) : (
              <Text style={styles.sendButtonText}>Gönder</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.micButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              isRecording && styles.micButtonActive,
            ]}
            onPressIn={handleStartRecording}
            onPressOut={handleStopRecording}
            disabled={uploadingMedia}>
            <Text style={styles.micIcon}>🎤</Text>
          </Pressable>
        )}
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
  headerIconButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerIconText: {
    fontSize: 20,
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
  offlineBanner: {
    backgroundColor: 'rgba(255,184,77,0.14)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineBannerText: {
    color: '#FFB84D',
    fontSize: 12.5,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  loadingMoreRow: {
    paddingVertical: 10,
    alignItems: 'center',
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
  attachButton: {
    paddingHorizontal: 6,
    paddingVertical: 10,
    marginRight: 4,
  },
  attachIcon: {
    fontSize: 22,
  },
  micButton: {
    backgroundColor: '#1C1F26',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  micButtonActive: {
    backgroundColor: '#FF6B6B',
  },
  micIcon: {
    fontSize: 18,
  },
  uploadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  uploadingBannerText: {
    color: 'rgba(245,245,247,0.6)',
    fontSize: 12,
    marginLeft: 8,
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 16,
    backgroundColor: '#0F1115',
  },
  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#FF6B6B',
    marginRight: 8,
  },
});

export default ChatRoomScreen;
