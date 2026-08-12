import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Contact, subscribeToContacts } from '../services/contactService';
import { ChatMessage, getRoomId, subscribeToLatestMessage } from '../services/chatService';
import { playNotificationSound } from '../services/soundService';
import { isNotificationsEnabled } from '../services/notificationService';
import { vibrateShort } from '../services/hapticsService';

interface Props {
  myUid: string;
  /** The contact whose room is currently open on screen, if any — its messages never toast. */
  activeContactUid: string | null;
  onOpenRoom: (contact: Contact) => void;
  children: React.ReactNode;
}

interface ToastState {
  contact: Contact;
  preview: string;
}

const TOAST_VISIBLE_MS = 3200;

function previewForMessage(message: ChatMessage): string {
  switch (message.type) {
    case 'image':
      return '📷 Fotoğraf gönderdi';
    case 'video':
      return '🎬 Video gönderdi';
    case 'audio':
      return '🎤 Sesli mesaj gönderdi';
    case 'call':
      return '';
    default:
      return message.text.length > 60 ? `${message.text.slice(0, 60)}…` : message.text;
  }
}

/**
 * Wraps the authenticated screens (like CallProvider) and watches every
 * contact's room for new incoming messages, surfacing them as an in-app,
 * game-styled toast (per product decision — see ObsidianVault Changelog —
 * this is the "works only while the app is open/foreground" option chosen
 * over a full FCM background-push setup, which was deferred). Deliberately
 * built as a self-contained watcher + a single `notify()`-shaped entry point
 * (`showToast`) so swapping in real push later only means changing *how*
 * `showToast` gets triggered, not this component's structure.
 */
function NotificationCenter({ myUid, activeContactUid, onOpenRoom, children }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);

  const activeContactUidRef = useRef(activeContactUid);
  activeContactUidRef.current = activeContactUid;
  const mountedAtRef = useRef(Date.now());
  const notifiedIdsRef = useRef(new Set<string>());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomUnsubscribesRef = useRef<(() => void)[]>([]);

  const translateY = useRef(new Animated.Value(-120)).current;

  const showToast = (contact: Contact, message: ChatMessage) => {
    if (!isNotificationsEnabled()) {
      return;
    }
    playNotificationSound();
    vibrateShort();
    setToast({ contact, preview: previewForMessage(message) });
    translateY.setValue(-120);
    Animated.spring(translateY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => setToast(null));
    }, TOAST_VISIBLE_MS);
  };

  useEffect(() => {
    const unsubscribeContacts = subscribeToContacts(
      myUid,
      contacts => {
        // Contact list rarely changes mid-session; simplest correct approach
        // is to tear down and rebuild all per-room listeners on every update
        // rather than diffing — avoids ever leaking a listener for a removed
        // contact.
        roomUnsubscribesRef.current.forEach(unsub => unsub());
        roomUnsubscribesRef.current = contacts.map(contact => {
          const roomId = getRoomId(myUid, contact.uid);
          return subscribeToLatestMessage(roomId, message => {
            if (!message || message.type === 'call' || message.senderId === myUid) {
              return;
            }
            if (message.createdAt <= mountedAtRef.current) {
              return; // pre-existing history, not a fresh arrival
            }
            if (notifiedIdsRef.current.has(message.id)) {
              return;
            }
            if (activeContactUidRef.current === contact.uid) {
              return; // already looking at this exact chat
            }
            notifiedIdsRef.current.add(message.id);
            showToast(contact, message);
          });
        });
      },
      () => undefined,
    );

    return () => {
      unsubscribeContacts();
      roomUnsubscribesRef.current.forEach(unsub => unsub());
      roomUnsubscribesRef.current = [];
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myUid]);

  const handlePress = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    const contact = toast?.contact;
    setToast(null);
    if (contact) {
      onOpenRoom(contact);
    }
  };

  return (
    <View style={styles.fill}>
      {children}

      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.toastWrap, { top: insets.top + 10, transform: [{ translateY }] }]}>
          <Pressable onPress={handlePress} style={styles.toastCard} accessibilityRole="button">
            <View style={styles.toastBadge}>
              <Text style={styles.toastBadgeIcon}>🎮</Text>
            </View>
            <View style={styles.toastTextWrap}>
              <Text style={styles.toastTitle} numberOfLines={1}>
                {toast.contact.name}
              </Text>
              {toast.preview.length > 0 && (
                <Text style={styles.toastSubtitle} numberOfLines={1}>
                  {toast.preview}
                </Text>
              )}
            </View>
            <View style={styles.toastDot} />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  toastWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 100,
    elevation: 20,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1F2A',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  toastBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(77,150,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toastBadgeIcon: {
    fontSize: 20,
  },
  toastTextWrap: {
    flex: 1,
  },
  toastTitle: {
    color: '#F5F5F7',
    fontSize: 14,
    fontWeight: '800',
  },
  toastSubtitle: {
    color: 'rgba(245,245,247,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  toastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6BCB77',
    marginLeft: 8,
  },
});

export default NotificationCenter;
