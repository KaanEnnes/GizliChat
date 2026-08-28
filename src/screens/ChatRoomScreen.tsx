import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  ImageBackground,
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
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import Sound from 'react-native-nitro-sound';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MessageBubble, { replyPreviewLabel } from '../components/MessageBubble';
import ImageGalleryModal from '../components/ImageGalleryModal';
import AttachMenuModal from '../components/AttachMenuModal';
import GifPickerModal from '../components/GifPickerModal';
import RecordingWaveform from '../components/RecordingWaveform';
import Avatar from '../components/Avatar';
import StorageQuotaBanner from '../components/StorageQuotaBanner';
import { ADMIN_UID } from '../config/adminConfig';
import OnlineTicTacToeModal from '../components/OnlineTicTacToeModal';
import ChessContactModal from '../components/ChessContactModal';
import { BackChevronIcon, GameControllerIcon, ImageIcon, PhoneCallIcon, VideoCallIcon } from '../components/CallIcons';
import { subscribeToGame, TicTacToeGame } from '../services/ticTacToeService';
import { ChessGame, subscribeToContactChessGame } from '../services/chessService';
import { Contact } from '../services/contactService';
import {
  ChatMessage,
  deleteMessage,
  editMessage,
  fetchMessageById,
  getRoomId,
  INITIAL_MESSAGE_LIMIT,
  markMessageRead,
  MAX_MESSAGE_LIMIT,
  MESSAGE_LIMIT_STEP,
  pinMessage,
  sendFileMessage,
  sendMediaMessage,
  sendMessage,
  setMessageReaction,
  subscribeToMessages,
  subscribeToPinnedMessageId,
  unpinMessage,
} from '../services/chatService';
import { localFileToDataUri, uploadRoomMedia } from '../services/mediaService';
import { startVoiceCall, startVideoCall } from '../services/callService';
import { requestMicrophonePermission } from '../services/permissionsService';
import { markRoomRead } from '../services/readStatusService';
import { addVideoBytesUsed, subscribeToUserProfile } from '../services/userService';
import { getChatBackground, setChatBackground } from '../services/chatBackgroundService';
import { useTheme } from '../theme/ThemeContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface Props {
  myUid: string;
  myUsername: string;
  contact: Contact;
  onBack: () => void;
  /** Set when this room was opened from a global search result — jumps to and highlights that message once its page of history is loaded. */
  initialJumpMessageId?: string;
}

// Firestore'un tek doküman limiti 1 MiB — base64 encoding ham veriyi ~%33
// büyüttüğü için bu eşik, diğer mesaj alanları için de pay bırakacak
// şekilde 900.000 karakterde (data URI önekiyle birlikte) tutuluyor.
const MAX_INLINE_MEDIA_DATA_URI_LENGTH = 900_000;
// MediaRecorder.stop() throws natively if called too soon after start() —
// below this, we treat the press as an accidental tap, not a real message.
const MIN_RECORDING_MS = 600;
// How close (in px) to the bottom of the list still counts as "already at
// the bottom" for auto-scroll purposes — small enough to not trigger while
// mid-scroll through history, generous enough to survive minor list jitter.
const NEAR_BOTTOM_THRESHOLD_PX = 120;

function ChatRoomScreen({ myUid, myUsername, contact, onBack, initialJumpMessageId }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const isOnline = useNetworkStatus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageLimit, setMessageLimit] = useState(INITIAL_MESSAGE_LIMIT);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedStart, setReachedStart] = useState(false);
  const [draft, setDraft] = useState('');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingLevel, setRecordingLevel] = useState(0);
  const [callStarting, setCallStarting] = useState(false);
  const [newMessagesBelow, setNewMessagesBelow] = useState(false);
  const [contactPhotoUrl, setContactPhotoUrl] = useState<string | undefined>(undefined);
  const [myVideoBytesUsed, setMyVideoBytesUsed] = useState(0);
  const [backgroundUri, setBackgroundUri] = useState<string | null>(null);
  const [ticTacToeGame, setTicTacToeGame] = useState<TicTacToeGame | null>(null);
  const [ticTacToeModalVisible, setTicTacToeModalVisible] = useState(false);
  const [chessGame, setChessGame] = useState<ChessGame | null>(null);
  const [chessModalVisible, setChessModalVisible] = useState(false);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [pinnedMessagePreview, setPinnedMessagePreview] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [galleryMessageId, setGalleryMessageId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const consumedInitialJumpRef = useRef<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const lastMessageIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  // Whether the user is currently scrolled near the bottom of the list —
  // drives whether a fresh message should auto-scroll into view or just
  // surface the "new messages" pill instead of yanking their scroll
  // position while they're reading older history.
  const isNearBottomRef = useRef(true);
  // Tracks which message ids we've already requested a read-receipt write
  // for, independent of the server-confirmed `readAt` field — that field
  // stays falsy locally for a bit after the write (pending serverTimestamp),
  // during which every intervening snapshot would otherwise re-trigger
  // duplicate markMessageRead calls for the same message.
  const markedReadIdsRef = useRef<Set<string>>(new Set());
  // Mirrors AppState so the read-receipt effect below can skip writing
  // readAt while the app is backgrounded/screen-off — the room screen stays
  // mounted in the navigation stack even then, so without this check an
  // incoming message would get marked "seen" purely because it was rendered
  // off-screen, not because the user actually looked at it.
  const isAppActiveRef = useRef(AppState.currentState === 'active');
  // Resolves once a just-started recording has actually finished starting
  // (native startRecorder() is async). On a quick tap, onPressOut can fire
  // before that promise settles — without waiting for it here, stopRecording
  // would see isRecordingRef still false and bail out early, leaving the
  // native recorder running with no way to stop it until the next press.
  const startRecordingPromiseRef = useRef<Promise<void> | null>(null);
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
    setMessageLimit(initialJumpMessageId ? MAX_MESSAGE_LIMIT : INITIAL_MESSAGE_LIMIT);
    setReachedStart(false);
    lastMessageIdRef.current = null;
    markedReadIdsRef.current.clear();
    isNearBottomRef.current = true;
    setNewMessagesBelow(false);
    setSearchOpen(false);
    setSearchQuery('');
    setHighlightedMessageId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => subscribeToPinnedMessageId(roomId, setPinnedMessageId), [roomId]);

  // Resolves the pinned message's content for the banner preview — first
  // from whatever's already loaded in `messages` (the common case, no extra
  // read), falling back to a one-off fetch if it's scrolled out of the
  // currently-loaded page.
  useEffect(() => {
    if (!pinnedMessageId) {
      setPinnedMessagePreview(null);
      return;
    }
    const loaded = messages.find(m => m.id === pinnedMessageId);
    if (loaded) {
      setPinnedMessagePreview(loaded);
      return;
    }
    let cancelled = false;
    fetchMessageById(roomId, pinnedMessageId, myUid).then(msg => {
      if (!cancelled) {
        // Deleted: keep it out of the pin banner even though the fallback
        // fetch (unlike subscribeToMessages) doesn't filter it.
        setPinnedMessagePreview(msg && !msg.deleted ? msg : null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pinnedMessageId, messages, roomId, myUid]);

  useEffect(() => subscribeToUserProfile(contact.uid, profile => setContactPhotoUrl(profile.photoUrl)), [contact.uid]);
  useEffect(() => subscribeToUserProfile(myUid, profile => setMyVideoBytesUsed(profile.videoBytesUsed)), [myUid]);
  useEffect(() => subscribeToGame(roomId, setTicTacToeGame), [roomId]);
  useEffect(() => subscribeToContactChessGame(roomId, setChessGame), [roomId]);

  const handleOpenGameMenu = useCallback(() => {
    Alert.alert('Oyun', `${contact.name} ile oyna`, [
      { text: 'XOX', onPress: () => setTicTacToeModalVisible(true) },
      { text: 'Satranç', onPress: () => setChessModalVisible(true) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }, [contact.name]);

  useEffect(() => {
    let cancelled = false;
    getChatBackground(roomId).then(uri => {
      if (!cancelled) {
        setBackgroundUri(uri);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const handleChangeBackground = useCallback(() => {
    Alert.alert('Sohbet Arka Planı', undefined, [
      {
        text: 'Galeriden seç',
        onPress: () => {
          launchImageLibrary({ mediaType: 'photo', quality: 0.6, maxWidth: 1000, maxHeight: 1000, includeBase64: true }, async result => {
            if (result.didCancel || !result.assets || result.assets.length === 0) {
              return;
            }
            const asset = result.assets[0];
            if (!asset.base64) {
              return;
            }
            const dataUri = `data:${asset.type || 'image/jpeg'};base64,${asset.base64}`;
            setBackgroundUri(dataUri);
            setChatBackground(roomId, dataUri).catch(() => undefined);
          });
        },
      },
      ...(backgroundUri
        ? [
            {
              text: 'Arka planı kaldır',
              style: 'destructive' as const,
              onPress: () => {
                setBackgroundUri(null);
                setChatBackground(roomId, null).catch(() => undefined);
              },
            },
          ]
        : []),
      { text: 'Vazgeç', style: 'cancel' as const },
    ]);
  }, [roomId, backgroundUri]);

  useEffect(() => {
    const unsubscribe = subscribeToMessages(
      roomId,
      messageLimit,
      myUid,
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
  }, [roomId, messageLimit, myUid]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || reachedStart || messageLimit >= MAX_MESSAGE_LIMIT) {
      return;
    }
    setLoadingMore(true);
    setMessageLimit(prev => Math.min(prev + MESSAGE_LIMIT_STEP, MAX_MESSAGE_LIMIT));
  }, [loadingMore, reachedStart, messageLimit]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      if (contentOffset.y < 60) {
        handleLoadMore();
      }
      const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
      isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
      if (isNearBottomRef.current) {
        setNewMessagesBelow(false);
      }
    },
    [handleLoadMore],
  );

  const markVisibleMessagesRead = useCallback(() => {
    if (!isAppActiveRef.current) {
      return;
    }
    // Room is open and the app is actually in the foreground, so every
    // incoming message from the other person is being shown on screen right
    // now — write the shared read receipt (visible to the sender as blue
    // double ticks) for any of their messages that don't have one yet.
    // Already-read messages are skipped, so this doesn't loop.
    messages.forEach(message => {
      if (
        message.senderId !== myUid &&
        message.type !== 'call' &&
        !message.readAt &&
        !markedReadIdsRef.current.has(message.id)
      ) {
        markedReadIdsRef.current.add(message.id);
        markMessageRead(roomId, message.id).catch(() => {
          // Allow a retry on the next snapshot if the write actually failed.
          markedReadIdsRef.current.delete(message.id);
        });
      }
    });
  }, [messages, roomId, myUid]);

  useEffect(() => {
    markVisibleMessagesRead();
  }, [markVisibleMessagesRead]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const wasActive = isAppActiveRef.current;
      isAppActiveRef.current = nextState === 'active';
      // Catch up on anything that arrived while the screen was off/backgrounded.
      if (!wasActive && isAppActiveRef.current) {
        markVisibleMessagesRead();
      }
    });
    return () => subscription.remove();
  }, [markVisibleMessagesRead]);

  useEffect(() => {
    // Only react when the newest message actually changed (a fresh
    // incoming/outgoing message) — not when older messages get prepended by
    // scrolling up for more history, which would otherwise yank the view
    // back down every time a page of history loads.
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    if (lastMessage === null || lastMessage.id === lastMessageIdRef.current) {
      return;
    }
    const isInitialLoad = lastMessageIdRef.current === null;
    const isMine = lastMessage.senderId === myUid;
    // Smart scroll: always jump to a message the user just sent themselves
    // (and on first room open), but only auto-follow an *incoming* message
    // if the user is already near the bottom — otherwise leave their scroll
    // position alone and surface the "new messages" pill instead, exactly
    // like scrolling up to read history shouldn't get yanked back down.
    if (isInitialLoad || isMine || isNearBottomRef.current) {
      const animate = !isInitialLoad;
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: animate });
      });
      setNewMessagesBelow(false);
    } else {
      setNewMessagesBelow(true);
    }
    lastMessageIdRef.current = lastMessage.id;
  }, [messages, myUid]);

  useEffect(() => {
    if (messages.length > 0) {
      // Room is open and rendering these messages right now, so mark them
      // read as they arrive — keeps the contacts list unread badge accurate
      // without waiting for the user to leave and re-enter the room.
      markRoomRead(roomId, messages[messages.length - 1].createdAt);
    }
  }, [messages, roomId]);

  const handleJumpToBottom = useCallback(() => {
    isNearBottomRef.current = true;
    setNewMessagesBelow(false);
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
    setDraft('');
  }, []);

  const handleReplyRequest = useCallback((message: ChatMessage) => {
    setEditingMessage(null);
    setReplyingTo(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }
    const editing = editingMessage;
    const replying = replyingTo;
    // Cleared immediately (optimistic) instead of waiting for the network
    // request to resolve — on a slow connection the old "only clear on
    // success" behavior made the input visibly sit there holding the typed
    // text, which read as the send button doing nothing. A failed send still
    // surfaces via connectionError below; retyping is cheap enough that
    // losing the draft on the rare failure isn't worth the perceived lag.
    setDraft('');
    setEditingMessage(null);
    setReplyingTo(null);
    // Fired without waiting on any previous send — each message is its own
    // independent Firestore write, so there's no correctness reason to
    // serialize them. Previously a `sendingRef`/`sending` guard blocked the
    // send button until the prior request resolved, which meant typing and
    // sending a second message quickly (before the first one's network
    // round-trip finished) silently did nothing until it caught up.
    const request = editing
      ? editMessage(roomId, editing.id, trimmed, myUid)
      : sendMessage(
          roomId,
          trimmed,
          myUid,
          replying ? { id: replying.id, type: replying.type, text: replying.text, senderId: replying.senderId } : undefined,
        );
    request.catch(error => {
      setConnectionError(editing ? `Mesaj düzenlenemedi: ${error.message}` : `Mesaj gönderilemedi: ${error.message}`);
    });
  }, [draft, roomId, myUid, editingMessage, replyingTo]);

  const sendPickedAsset = useCallback(
    async (asset: { uri?: string; type?: string; base64?: string }, hidden?: boolean) => {
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
        try {
          await sendMediaMessage(roomId, myUid, 'image', dataUri, undefined, hidden);
        } catch (error) {
          setConnectionError(`Fotoğraf gönderilemedi: ${(error as Error).message}`);
        }
        return;
      }

      const extension = isVideo ? 'mp4' : 'jpg';
      try {
        const { url, sizeBytes } = await uploadRoomMedia(roomId, isVideo ? 'video' : 'image', asset.uri, extension);
        // sizeBytes is only stored on the message for a video (see
        // ChatMessage.sizeBytes) — chatService's deleteMessage() needs it to
        // refund the sender's video-storage quota once nobody can see the
        // message anymore.
        await sendMediaMessage(roomId, myUid, isVideo ? 'video' : 'image', url, undefined, hidden, isVideo ? sizeBytes : undefined);
        if (isVideo) {
          addVideoBytesUsed(myUid, sizeBytes).catch(() => undefined);
        }
      } catch (error) {
        setConnectionError(`Medya gönderilemedi: ${(error as Error).message}`);
      }
    },
    [roomId, myUid],
  );

  const handlePickMedia = useCallback(
    (source: 'library' | 'camera', hidden?: boolean) => {
      const pickerFn = source === 'library' ? launchImageLibrary : launchCamera;
      pickerFn(
        {
          mediaType: 'mixed',
          quality: 0.7,
          maxWidth: 1280,
          maxHeight: 1280,
          includeBase64: true,
          // Galeriden birden fazla fotoğraf/video seçilebilsin diye
          // (0 = sınırsız); kamerada tek çekim olduğu için bu alan
          // yok sayılır, davranışı etkilemez.
          selectionLimit: 0,
          // Videolar cihazda seçilir seçilmez düşük kalitede yeniden
          // kodlanır (OS seviyesinde) — sunucuya çok daha küçük dosya
          // gidiyor, ekstra bir sıkıştırma kütüphanesine gerek kalmadan.
          // Fotoğrafları etkilemiyor, onlar zaten ayrı `quality` ile küçültülüyor.
          videoQuality: 'low',
        },
        async result => {
          if (result.didCancel || !result.assets || result.assets.length === 0) {
            return;
          }
          setUploadingMedia(true);
          try {
            // Sırayla gönderiliyor (paralel değil) ki mesajlar Firestore'a
            // seçim sırasıyla düşsün ve aynı anda birden çok büyük video
            // yüklemesi başlayıp bant genişliğini/bar kotasını tıkamasın.
            for (const asset of result.assets) {
              await sendPickedAsset(asset, hidden);
            }
          } finally {
            setUploadingMedia(false);
          }
        },
      );
    },
    [sendPickedAsset],
  );

  const handleImagePress = useCallback((messageId: string) => {
    setGalleryMessageId(messageId);
  }, []);

  // Hidden ("gizli") photos are excluded from the shared swipe-through gallery — each one
  // must still be revealed individually on its own bubble before it can be viewed at all, so
  // letting the gallery page past a still-hidden photo would leak its content. If the tapped
  // photo is itself hidden (i.e. the user just revealed it), it's shown alone with no swiping.
  const galleryImages = useMemo(() => {
    if (!galleryMessageId) {
      return [];
    }
    const tapped = messages.find(m => m.id === galleryMessageId);
    if (!tapped) {
      return [];
    }
    if (tapped.hidden) {
      return [tapped];
    }
    return messages.filter(m => m.type === 'image' && m.mediaUrl && !m.hidden);
  }, [galleryMessageId, messages]);

  const handlePickFile = useCallback(async () => {
    let picked;
    try {
      [picked] = await pick({ type: '*/*' });
    } catch (error) {
      if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      setConnectionError(`Dosya seçilemedi: ${(error as Error).message}`);
      return;
    }

    const fileName = picked.name ?? 'dosya';
    const fileSize = picked.size ?? 0;
    setUploadingMedia(true);
    try {
      // Küçük dosyalar fotoğraflar gibi doğrudan Firestore'a gömülüyor;
      // büyük dosyalar videoyla aynı yoldan Storage'a yükleniyor. Her iki
      // durumda da gönderilen boyut kadar 5GB'lık depolama barına ekleniyor
      // (fotoğraf/ses gibi küçük medyalardan farklı olarak — kullanıcı
      // dosya göndermenin barı doldurmasını istedi).
      if (fileSize > 0 && fileSize <= MAX_INLINE_MEDIA_DATA_URI_LENGTH * 0.7) {
        const dataUri = await localFileToDataUri(picked.uri);
        if (dataUri.length > MAX_INLINE_MEDIA_DATA_URI_LENGTH) {
          throw new Error('Dosya çok büyük.');
        }
        await sendFileMessage(roomId, myUid, dataUri, fileName, fileSize);
      } else {
        const extension = fileName.includes('.') ? fileName.split('.').pop()! : 'bin';
        const { url } = await uploadRoomMedia(roomId, 'file', picked.uri, extension);
        await sendFileMessage(roomId, myUid, url, fileName, fileSize);
      }
      if (fileSize > 0) {
        addVideoBytesUsed(myUid, fileSize).catch(() => undefined);
      }
    } catch (error) {
      setConnectionError(`Dosya gönderilemedi: ${(error as Error).message}`);
    } finally {
      setUploadingMedia(false);
    }
  }, [roomId, myUid]);

  const handleAttachPress = useCallback(() => {
    setAttachMenuVisible(true);
  }, []);

  const handleStartRecording = useCallback(() => {
    const startPromise = (async () => {
      const granted = await requestMicrophonePermission();
      if (!granted) {
        setConnectionError('Sesli mesaj için mikrofon izni gerekiyor.');
        return;
      }
      try {
        await Sound.startRecorder(undefined, undefined, true);
        recordingStartedAtRef.current = Date.now();
        isRecordingRef.current = true;
        setIsRecording(true);
        setRecordingLevel(0);
        Sound.addRecordBackListener(status => {
          const db = status.currentMetering ?? -60;
          setRecordingLevel(Math.min(1, Math.max(0, (db + 60) / 60)));
        });
      } catch (error) {
        setConnectionError(`Kayıt başlatılamadı: ${(error as Error).message}`);
      }
    })();
    startRecordingPromiseRef.current = startPromise;
    startPromise.finally(() => {
      if (startRecordingPromiseRef.current === startPromise) {
        startRecordingPromiseRef.current = null;
      }
    });
  }, []);

  const handleStopRecording = useCallback(async () => {
    // A quick tap can release before handleStartRecording's native call
    // above has actually resolved — wait for it so this doesn't miss a
    // recording that's still in the middle of starting.
    if (startRecordingPromiseRef.current) {
      await startRecordingPromiseRef.current;
    }
    if (!isRecordingRef.current) {
      return;
    }
    isRecordingRef.current = false;
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
  }, [roomId, myUid]);

  const handleToggleReaction = useCallback(
    (message: ChatMessage, emoji: string) => {
      const current = message.reactions?.[myUid];
      setMessageReaction(roomId, message.id, myUid, current === emoji ? null : emoji).catch(error => {
        setConnectionError(`Tepki eklenemedi: ${(error as Error).message}`);
      });
    },
    [roomId, myUid],
  );

  const handlePinMessage = useCallback(
    (message: ChatMessage) => {
      pinMessage(roomId, message.id).catch(error => {
        setConnectionError(`Sabitlenemedi: ${(error as Error).message}`);
      });
    },
    [roomId],
  );

  const handleUnpinMessage = useCallback(() => {
    unpinMessage(roomId).catch(error => {
      setConnectionError(`Sabit kaldırılamadı: ${(error as Error).message}`);
    });
  }, [roomId]);

  const handleEditRequest = useCallback((message: ChatMessage) => {
    setReplyingTo(null);
    setEditingMessage(message);
    setDraft(message.text);
  }, []);

  // Hides the message for both room members at once — the underlying data
  // stays intact in Firestore (see deleteMessage() in chatService.ts).
  const handleDeleteMessage = useCallback(
    (message: ChatMessage) => {
      Alert.alert('Mesajı sil', 'Bu mesaj hem sende hem karşı tarafta silinecek.', [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            deleteMessage(roomId, message, myUid).catch(error => {
              setConnectionError(`Silinemedi: ${(error as Error).message}`);
            });
          },
        },
      ]);
    },
    [roomId, myUid],
  );

  const scrollToMessageId = useCallback(
    (messageId: string) => {
      const target = messages.find(m => m.id === messageId);
      if (!target) {
        return false;
      }
      try {
        listRef.current?.scrollToItem({ item: target, animated: true, viewPosition: 0.3 });
      } catch {
        // Item not in the currently-rendered window — nothing reasonable to do without getItemLayout.
      }
      return true;
    },
    [messages],
  );

  const handleJumpToPinned = useCallback(() => {
    if (pinnedMessagePreview) {
      scrollToMessageId(pinnedMessagePreview.id);
    }
  }, [pinnedMessagePreview, scrollToMessageId]);

  // Global-search entry point: once the widened history (see the messageLimit
  // reset above) has loaded far enough back to include the target message,
  // scroll to it and flash-highlight it — retried on every `messages` update
  // until found, since Firestore may deliver the page over more than one
  // snapshot.
  useEffect(() => {
    if (!initialJumpMessageId || consumedInitialJumpRef.current === initialJumpMessageId) {
      return;
    }
    if (scrollToMessageId(initialJumpMessageId)) {
      consumedInitialJumpRef.current = initialJumpMessageId;
      setHighlightedMessageId(initialJumpMessageId);
      const timer = setTimeout(() => setHighlightedMessageId(null), 2500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [initialJumpMessageId, messages, scrollToMessageId]);

  // In-chat search: matches are computed over whatever's currently loaded in
  // `messages` (widened to MAX_MESSAGE_LIMIT below while search is open),
  // newest match first to match how someone typically searches — "find the
  // last time we talked about X".
  const searchMatches = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    return messages.filter(m => m.type === 'text' && m.text.toLowerCase().includes(needle)).reverse();
  }, [messages, searchQuery]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    // Widen the live query so search can reach further back than the normal
    // scroll-triggered pagination would have loaded by itself.
    setMessageLimit(MAX_MESSAGE_LIMIT);
  }, [searchOpen]);

  useEffect(() => {
    setSearchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    const current = searchMatches[searchIndex];
    if (current) {
      scrollToMessageId(current.id);
      setHighlightedMessageId(current.id);
    } else {
      setHighlightedMessageId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMatches, searchIndex]);

  const handleSearchPrev = useCallback(() => {
    setSearchIndex(i => (searchMatches.length ? (i + 1) % searchMatches.length : 0));
  }, [searchMatches.length]);

  const handleSearchNext = useCallback(() => {
    setSearchIndex(i => (searchMatches.length ? (i - 1 + searchMatches.length) % searchMatches.length : 0));
  }, [searchMatches.length]);

  const handleCloseSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setHighlightedMessageId(null);
  }, []);

  const canSend = draft.trim().length > 0;
  // Disclosed (not secret) admin access — the admin account has read-only
  // Firestore access to every room (see firestore.rules' isAdmin() and
  // ObsidianVault/Changelog.md). Skipped only when admin is literally one of
  // the two people in this room (talking to yourself needs no disclosure);
  // shown every time the room is otherwise opened, not a one-time
  // dismissible toast.
  const showAdminDisclosure = !!ADMIN_UID && myUid !== ADMIN_UID && contact.uid !== ADMIN_UID;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      // Android's manifest already sets windowSoftInputMode="adjustResize",
      // which resizes the native window above the keyboard on its own —
      // stacking a JS-side "height" behavior on top of that double-adjusts
      // and was leaving the input bar rendered behind/below the keyboard
      // instead of just above it. iOS has no such native resize, so it still
      // needs the "padding" behavior here.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
          <BackChevronIcon color={theme.textMuted} />
        </Pressable>
        <Avatar name={contact.name} size={34} photoUrl={contactPhotoUrl} />
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {contact.name}
        </Text>
        <Pressable
          onPress={() => setSearchOpen(v => !v)}
          hitSlop={8}
          style={styles.headerIconButton}
          accessibilityRole="button"
          accessibilityLabel="Sohbette ara">
          <Text style={styles.headerIconText}>🔍</Text>
        </Pressable>
        <Pressable
          onPress={handleChangeBackground}
          hitSlop={8}
          style={styles.headerIconButton}
          accessibilityRole="button"
          accessibilityLabel="Sohbet arka planını değiştir">
          <ImageIcon color={theme.textMuted} />
        </Pressable>
        <Pressable
          onPress={handleOpenGameMenu}
          hitSlop={8}
          style={styles.headerIconButton}
          accessibilityRole="button"
          accessibilityLabel={`${contact.name} ile oyun oyna`}>
          <GameControllerIcon color={theme.text} />
          {(ticTacToeGame?.status === 'active' || chessGame?.status === 'active') && (
            <View style={[styles.headerIconBadge, { backgroundColor: theme.danger, borderColor: theme.surface }]} />
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            if (callStarting) {
              return;
            }
            setCallStarting(true);
            startVoiceCall(myUid, myUsername, contact)
              .catch(error => {
                setConnectionError(`Arama başlatılamadı: ${(error as Error).message}`);
              })
              .finally(() => setCallStarting(false));
          }}
          hitSlop={8}
          disabled={callStarting}
          style={[styles.headerIconButton, callStarting && styles.headerIconButtonDisabled]}>
          <PhoneCallIcon color={theme.text} />
        </Pressable>
        <Pressable
          onPress={() => {
            if (callStarting) {
              return;
            }
            setCallStarting(true);
            startVideoCall(myUid, myUsername, contact)
              .catch(error => {
                setConnectionError(`Arama başlatılamadı: ${(error as Error).message}`);
              })
              .finally(() => setCallStarting(false));
          }}
          hitSlop={8}
          disabled={callStarting}
          style={[styles.headerIconButton, callStarting && styles.headerIconButtonDisabled]}>
          <VideoCallIcon color={theme.text} />
        </Pressable>
      </View>

      {searchOpen && (
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Sohbette ara..."
            placeholderTextColor={theme.textFaint}
            style={[styles.searchInput, { color: theme.text }]}
            autoFocus
          />
          {!!searchQuery.trim() && (
            <Text style={[styles.searchCount, { color: theme.textMuted }]}>
              {searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : '0/0'}
            </Text>
          )}
          <Pressable
            onPress={handleSearchPrev}
            disabled={!searchMatches.length}
            hitSlop={8}
            style={styles.searchNavButton}
            accessibilityRole="button"
            accessibilityLabel="Önceki sonuç">
            <Text style={[styles.searchNavIcon, { color: searchMatches.length ? theme.text : theme.textFaint }]}>↑</Text>
          </Pressable>
          <Pressable
            onPress={handleSearchNext}
            disabled={!searchMatches.length}
            hitSlop={8}
            style={styles.searchNavButton}
            accessibilityRole="button"
            accessibilityLabel="Sonraki sonuç">
            <Text style={[styles.searchNavIcon, { color: searchMatches.length ? theme.text : theme.textFaint }]}>↓</Text>
          </Pressable>
          <Pressable onPress={handleCloseSearch} hitSlop={8} style={styles.searchNavButton} accessibilityRole="button" accessibilityLabel="Aramayı kapat">
            <Text style={[styles.searchNavIcon, { color: theme.text }]}>✕</Text>
          </Pressable>
        </View>
      )}

      {showAdminDisclosure && (
        <View style={[styles.adminDisclosureBanner, { backgroundColor: theme.warningSoft }]}>
          <Text style={[styles.adminDisclosureText, { color: theme.warning }]} numberOfLines={1}>
            🔒 Bu sohbet yönetici hesabı tarafından da görüntülenebilir
          </Text>
        </View>
      )}

      <StorageQuotaBanner usedBytes={myVideoBytesUsed} variant="strip" />

      <OnlineTicTacToeModal
        visible={ticTacToeModalVisible}
        onClose={() => setTicTacToeModalVisible(false)}
        roomId={roomId}
        myUid={myUid}
        contact={contact}
        game={ticTacToeGame}
      />

      <ChessContactModal
        visible={chessModalVisible}
        onClose={() => setChessModalVisible(false)}
        roomId={roomId}
        myUid={myUid}
        contact={contact}
        game={chessGame}
      />

      <AttachMenuModal
        visible={attachMenuVisible}
        onClose={() => setAttachMenuVisible(false)}
        onGallery={() => handlePickMedia('library')}
        onCamera={() => handlePickMedia('camera')}
        onHiddenMedia={() => handlePickMedia('library', true)}
        onFile={() => handlePickFile()}
        onGif={() => setGifPickerVisible(true)}
      />

      <GifPickerModal
        visible={gifPickerVisible}
        onClose={() => setGifPickerVisible(false)}
        onSelect={gif => {
          sendMediaMessage(roomId, myUid, 'image', gif.fullUrl).catch(error =>
            setConnectionError(`GIF gönderilemedi: ${(error as Error).message}`),
          );
        }}
      />

      {galleryMessageId && (
        <ImageGalleryModal images={galleryImages} initialMessageId={galleryMessageId} onClose={() => setGalleryMessageId(null)} />
      )}

      {pinnedMessagePreview && (
        <Pressable
          onPress={handleJumpToPinned}
          style={[styles.pinnedBanner, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
          accessibilityRole="button"
          accessibilityLabel="Sabitlenmiş mesaja git">
          <Text style={styles.pinnedBannerIcon}>📌</Text>
          <Text style={[styles.pinnedBannerText, { color: theme.textMuted }]} numberOfLines={1}>
            {pinnedMessagePreview.type === 'text'
              ? pinnedMessagePreview.text
              : pinnedMessagePreview.type === 'image'
              ? '📷 Fotoğraf'
              : pinnedMessagePreview.type === 'video'
              ? '🎥 Video'
              : pinnedMessagePreview.type === 'audio'
              ? '🎤 Sesli mesaj'
              : 'Mesaj'}
          </Text>
          <Pressable
            onPress={handleUnpinMessage}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Sabiti kaldır">
            <Text style={[styles.pinnedBannerClose, { color: theme.textFaint }]}>✕</Text>
          </Pressable>
        </Pressable>
      )}

      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: theme.warningSoft }]}>
          <Text style={[styles.offlineBannerText, { color: theme.warning }]}>📡 İnternet bağlantısı yok</Text>
        </View>
      )}

      {connectionError && (
        <View style={[styles.errorBanner, { backgroundColor: theme.dangerSoft, borderBottomColor: theme.dangerSoft }]}>
          <Text style={[styles.errorBannerText, { color: theme.danger }]}>{connectionError}</Text>
        </View>
      )}

      <ImageBackground
        source={backgroundUri ? { uri: backgroundUri } : undefined}
        style={styles.listWrap}
        imageStyle={styles.listBackgroundImage}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMine={item.senderId === myUid}
              myUid={myUid}
              isPinned={item.id === pinnedMessageId}
              highlighted={item.id === highlightedMessageId}
              onToggleReaction={handleToggleReaction}
              onPin={handlePinMessage}
              onUnpin={handleUnpinMessage}
              onEdit={handleEditRequest}
              onDelete={handleDeleteMessage}
              onReply={handleReplyRequest}
              onJumpToReply={scrollToMessageId}
              onImagePress={handleImagePress}
            />
          )}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={100}
          maintainVisibleContentPosition={loadingMore ? { minIndexForVisible: 0 } : undefined}
          ListHeaderComponent={
            loadingMore ? (
              <View style={styles.loadingMoreRow}>
                <ActivityIndicator color={theme.textFaint} size="small" />
              </View>
            ) : undefined
          }
        />

        {newMessagesBelow && (
          <Pressable
            onPress={handleJumpToBottom}
            style={[styles.jumpToBottomButton, { backgroundColor: theme.identity }]}>
            <Text style={[styles.jumpToBottomText, { color: theme.identityText }]}>Yeni mesajlar ↓</Text>
          </Pressable>
        )}
      </ImageBackground>

      {uploadingMedia && (
        <View style={[styles.uploadingBanner, { backgroundColor: theme.background }]}>
          <ActivityIndicator color={theme.identity} size="small" />
          <Text style={[styles.uploadingBannerText, { color: theme.textMuted }]}>Gönderiliyor…</Text>
        </View>
      )}

      {isRecording && (
        <View style={[styles.recordingBanner, { backgroundColor: theme.background }]}>
          <View style={[styles.recordingDot, { backgroundColor: theme.danger }]} />
          <RecordingWaveform level={recordingLevel} color={theme.identity} />
        </View>
      )}

      {replyingTo && (
        <View style={[styles.editingBanner, { backgroundColor: theme.surfaceAlt, borderTopColor: theme.border }]}>
          <Text style={[styles.editingBannerIcon, { color: theme.identity }]}>↩️</Text>
          <Text style={[styles.editingBannerText, { color: theme.textMuted }]} numberOfLines={1}>
            {replyingTo.senderId === myUid ? 'Kendine' : contact.name}{' '}
            yanıtlıyorsun: {replyPreviewLabel(replyingTo)}
          </Text>
          <Pressable onPress={handleCancelReply} hitSlop={8} accessibilityRole="button" accessibilityLabel="Yanıtlamayı iptal et">
            <Text style={[styles.editingBannerClose, { color: theme.textFaint }]}>✕</Text>
          </Pressable>
        </View>
      )}

      {editingMessage && (
        <View style={[styles.editingBanner, { backgroundColor: theme.surfaceAlt, borderTopColor: theme.border }]}>
          <Text style={[styles.editingBannerIcon, { color: theme.identity }]}>✏️</Text>
          <Text style={[styles.editingBannerText, { color: theme.textMuted }]} numberOfLines={1}>
            Mesajı düzenliyorsun: {editingMessage.text}
          </Text>
          <Pressable onPress={handleCancelEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Düzenlemeyi iptal et">
            <Text style={[styles.editingBannerClose, { color: theme.textFaint }]}>✕</Text>
          </Pressable>
        </View>
      )}

      <View
        style={[
          styles.inputBar,
          { backgroundColor: theme.surface, borderTopColor: theme.border },
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}>
        <Pressable
          onPress={handleAttachPress}
          hitSlop={8}
          style={styles.attachButton}
          disabled={uploadingMedia}
          accessibilityRole="button"
          accessibilityLabel="Medya ekle">
          <Text style={styles.attachIcon}>📎</Text>
        </Pressable>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBackground, color: theme.text, borderColor: theme.border },
          ]}
          placeholder="Mesaj yaz..."
          placeholderTextColor={theme.textFaint}
          value={draft}
          onChangeText={setDraft}
          multiline
          onSubmitEditing={Platform.OS === 'ios' ? handleSend : undefined}
        />
        {/*
          A single Pressable that switches appearance/behavior based on
          `canSend`, instead of two separate Pressable trees swapped via a
          ternary. Mounting/unmounting a brand-new native view on every
          keystroke transition (empty <-> non-empty draft) costs an extra
          native-bridge round trip, which read as the send button not
          appearing "instantly" after typing — updating one already-mounted
          view's style/text is immediate.
        */}
        <Pressable
          style={[
            canSend ? styles.sendButton : styles.micButton,
            canSend
              ? { backgroundColor: theme.accent }
              : [
                  { backgroundColor: theme.inputBackground, borderColor: theme.border },
                  isRecording && { backgroundColor: theme.danger, borderColor: theme.danger },
                ],
          ]}
          hitSlop={canSend ? undefined : 6}
          onPress={canSend ? handleSend : undefined}
          onPressIn={canSend ? undefined : handleStartRecording}
          onPressOut={canSend ? undefined : handleStopRecording}
          disabled={canSend ? false : uploadingMedia}
          accessibilityRole="button"
          accessibilityLabel={canSend ? 'Gönder' : 'Basılı tutarak sesli mesaj kaydet'}>
          {canSend ? (
            <Text style={[styles.sendButtonText, { color: theme.accentText }]}>
              {editingMessage ? 'Kaydet' : 'Gönder'}
            </Text>
          ) : (
            <Text style={styles.micIcon}>🎤</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 26,
    fontWeight: '600',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'left',
    marginLeft: 10,
  },
  headerIconButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'relative',
  },
  headerIconBadge: {
    position: 'absolute',
    top: 2,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  headerIconText: {
    fontSize: 20,
  },
  headerIconButtonDisabled: {
    opacity: 0.4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  searchCount: {
    fontSize: 13,
  },
  searchNavButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  searchNavIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
  errorBanner: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorBannerText: {
    fontSize: 12.5,
  },
  offlineBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offlineBannerText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  adminDisclosureBanner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  adminDisclosureText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  pinnedBannerIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  pinnedBannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  pinnedBannerClose: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  editingBannerIcon: {
    fontSize: 13,
    marginRight: 8,
  },
  editingBannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  editingBannerClose: {
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  listWrap: {
    flex: 1,
  },
  listBackgroundImage: {
    resizeMode: 'cover',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  loadingMoreRow: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  jumpToBottomButton: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  jumpToBottomText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
    marginRight: 10,
    borderWidth: 1,
  },
  sendButton: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  sendButtonText: {
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
    borderRadius: 22,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    fontSize: 12,
    marginLeft: 8,
  },
  recordingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 16,
  },
  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
  },
});

export default ChatRoomScreen;
