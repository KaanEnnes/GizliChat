import { useEffect, useRef } from 'react';
import { Alert, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { getRoomId, sendMessage, setMessageReaction, subscribeToMessages, type ChatMessage } from './chatService';
import type { Contact } from './contactService';
import type { ThemePalette } from '../theme/ThemeContext';

const { FloatingChat } = NativeModules as {
  FloatingChat?: {
    hasOverlayPermission: () => Promise<boolean>;
    requestOverlayPermission: () => Promise<boolean>;
    isIgnoringBatteryOptimizations: () => Promise<boolean>;
    requestIgnoreBatteryOptimizations: () => Promise<boolean>;
    show: (contactUid: string, contactName: string, myUid: string, themeJson: string, backgroundUri: string) => Promise<boolean>;
    hide: () => Promise<boolean>;
    updateMessages: (messagesJson: string) => Promise<boolean>;
  };
};

/**
 * Only the solid hex colors the floating window's native views need — several ThemePalette
 * tokens (border/overlay/dangerSoft/warningSoft/textFaint) are `rgba(...)` CSS strings that
 * Android's `Color.parseColor` can't read, so those are deliberately left out rather than sent
 * over and crash-guarded on the Kotlin side.
 */
function themeToFloatingPayload(theme: ThemePalette) {
  return {
    mode: theme.mode,
    background: theme.background,
    surface: theme.surface,
    surfaceAlt: theme.surfaceAlt,
    inputBackground: theme.inputBackground,
    text: theme.text,
    textMuted: theme.textMuted,
    identity: theme.identity,
    accent: theme.accent,
    bubbleMine: theme.bubbleMine,
    bubbleMineText: theme.bubbleMineText,
    bubbleOther: theme.bubbleOther,
    bubbleOtherText: theme.bubbleOtherText,
  };
}

const FLOATING_MESSAGE_COUNT = 30;

/**
 * Bu telefonun donanım/firmware'i Android'in resmi Picture-in-Picture'ını
 * desteklemediği doğrulandığı için (bkz. Changelog v1.7.6/v1.7.7) kendi küçük
 * yüzer sohbet penceremiz kullanılıyor. Firestore bağlantısı yine burada
 * (JS'de, chatService.ts üzerinden, mevcut oturumla) — native taraf sadece
 * göstergedir, bkz. `FloatingChatService.kt`'nin doc-comment'i.
 */
export async function startFloatingChat(
  contact: Contact,
  myUid: string,
  theme: ThemePalette,
  backgroundUri: string | null,
): Promise<void> {
  if (Platform.OS !== 'android' || !FloatingChat) {
    return;
  }
  const hasPermission = await FloatingChat.hasOverlayPermission();
  if (!hasPermission) {
    Alert.alert(
      'İzin gerekiyor',
      'Küçük pencere için telefon ayarlarından bu uygulamaya "Diğer uygulamaların üzerinde göster" izni vermen gerekiyor. Şimdi o ayar ekranını açalım mı?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Ayarları Aç', onPress: () => FloatingChat.requestOverlayPermission().catch(() => undefined) },
      ],
    );
    return;
  }
  try {
    await FloatingChat.show(contact.uid, contact.name, myUid, JSON.stringify(themeToFloatingPayload(theme)), backgroundUri ?? '');
  } catch (error) {
    Alert.alert('Küçük pencere açılamadı', (error as Error)?.message ?? String(error));
    return;
  }
  // Pil optimizasyonu istisnası istenmeden önce pencere zaten açıldı — bu izin
  // sadece "başka bir uygulamaya geçince mesajlar gecikmeden gelsin" içindir,
  // pencerenin çalışması buna bağlı değil, o yüzden akışı bloklamıyoruz.
  try {
    const ignoringAlready = await FloatingChat.isIgnoringBatteryOptimizations();
    if (!ignoringAlready) {
      Alert.alert(
        'Bir ayar daha gerekiyor',
        'Başka bir uygulamaya geçtiğinde mesajların gecikmeden gelmesi için bu uygulamaya pil optimizasyonundan muafiyet vermen gerekiyor. Şimdi o ayar ekranını açalım mı?',
        [
          { text: 'Şimdi değil', style: 'cancel' },
          { text: 'Ayarları Aç', onPress: () => FloatingChat.requestIgnoreBatteryOptimizations().catch(() => undefined) },
        ],
      );
    }
  } catch {
    // Bu ek/opsiyonel adım — kontrol başarısız olursa sessizce geç.
  }
}

function toFloatingPayload(messages: ChatMessage[]): string {
  return JSON.stringify(
    messages
      .filter(m => !m.deleted && m.type === 'text' && m.text)
      .slice(-FLOATING_MESSAGE_COUNT)
      .map(m => ({ id: m.id, text: m.text, senderId: m.senderId, reactions: m.reactions ?? {} })),
  );
}

/**
 * AppNavigator seviyesinde, kullanıcı giriş yaptığı sürece her zaman mount
 * edilir — küçük pencere açıkken de (ana sohbet ekranı arka planda/kapalı
 * olsa bile) mesaj alışverişinin çalışması için bu hook'un ChatRoomScreen'e
 * bağımlı olmaması gerekiyor.
 */
export function useFloatingChatBridge(myUid: string | null): void {
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const roomIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !FloatingChat || !myUid) {
      return undefined;
    }
    const emitter = new NativeEventEmitter(NativeModules.FloatingChat);

    const openedSub = emitter.addListener('floatingChatOpened', (payload: { contactUid: string; myUid: string }) => {
      unsubscribeRef.current?.();
      const roomId = getRoomId(payload.myUid, payload.contactUid);
      roomIdRef.current = roomId;
      unsubscribeRef.current = subscribeToMessages(
        roomId,
        FLOATING_MESSAGE_COUNT,
        payload.myUid,
        messages => FloatingChat.updateMessages(toFloatingPayload(messages)).catch(() => undefined),
        () => undefined,
      );
    });

    const sendSub = emitter.addListener(
      'floatingChatSend',
      (payload: { text: string; replyToId?: string; replyToText?: string; replyToSenderId?: string }) => {
        const roomId = roomIdRef.current;
        if (!roomId || !myUid) {
          return;
        }
        const replyTo = payload.replyToId
          ? {
              id: payload.replyToId,
              type: 'text' as const,
              senderId: payload.replyToSenderId ?? '',
              text: payload.replyToText ?? '',
            }
          : undefined;
        sendMessage(roomId, payload.text, myUid, replyTo).catch(() => undefined);
      },
    );

    const reactSub = emitter.addListener('floatingChatReact', (payload: { messageId: string; emoji: string }) => {
      const roomId = roomIdRef.current;
      if (roomId && myUid && payload.messageId) {
        setMessageReaction(roomId, payload.messageId, myUid, payload.emoji).catch(() => undefined);
      }
    });

    const closedSub = emitter.addListener('floatingChatClosed', () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      roomIdRef.current = null;
    });

    return () => {
      openedSub.remove();
      sendSub.remove();
      reactSub.remove();
      closedSub.remove();
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, [myUid]);
}
