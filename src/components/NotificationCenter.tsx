import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Contact, subscribeToContacts } from '../services/contactService';
import { getRoomId, markMessageDelivered, subscribeToLatestMessage } from '../services/chatService';
import { playNotificationSound } from '../services/soundService';
import { isNotificationsEnabled } from '../services/notificationService';
import { vibrateShort } from '../services/hapticsService';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  myUid: string;
  /** The contact whose room is currently open on screen, if any — its messages never toast. */
  activeContactUid: string | null;
  onOpenRoom: (contact: Contact) => void;
  children: React.ReactNode;
}

interface ToastState {
  contact: Contact;
  body: string;
}

const TOAST_VISIBLE_MS = 3200;

// Deliberately generic, game-flavored copy — no sender name or message
// content ever surfaces here, so a toast reveals nothing about the disguise
// underneath even if someone else is glancing at the screen. One is picked
// at random per notification.
const FAKE_GAME_NOTIFICATIONS = [
  'Günlük ödülünü almayı unutma!',
  'Yeni bir yüksek skor kırıldı!',
  'Bugünkü meydan okuma seni bekliyor.',
  'Enerjin doldu, hemen oyna!',
  'Arkadaşın seni skor tablosunda geçti!',
  'Yeni bir mini oyun eklendi, dene!',
];

function randomFakeNotification(): string {
  return FAKE_GAME_NOTIFICATIONS[Math.floor(Math.random() * FAKE_GAME_NOTIFICATIONS.length)];
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
 *
 * At most one toast is ever "pending" at a time: once shown, no further
 * toast fires — for that contact or any other — until the current one is
 * actually opened (tapped, which also opens its room). This mirrors a real
 * notification tray rather than a chat-style stream of alerts, and keeps a
 * burst of incoming messages from stacking up multiple reveals on screen.
 */
function NotificationCenter({ myUid, activeContactUid, onOpenRoom, children }: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [toast, setToast] = useState<ToastState | null>(null);

  const activeContactUidRef = useRef(activeContactUid);
  activeContactUidRef.current = activeContactUid;
  const mountedAtRef = useRef(Date.now());
  const notifiedIdsRef = useRef(new Set<string>());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomUnsubscribesRef = useRef<(() => void)[]>([]);
  // True from the moment a toast appears until the user actually taps it
  // open — while true, every other arrival is ignored outright rather than
  // queued, so nothing "catches up" in a burst once it does reopen.
  const hasPendingToastRef = useRef(false);

  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (activeContactUid) {
      // Opened some room (whether via the toast or by navigating there
      // directly) — treat that as the pending notification having been dealt
      // with, even if it was never tapped itself.
      hasPendingToastRef.current = false;
    }
  }, [activeContactUid]);

  const showToast = (contact: Contact) => {
    if (!isNotificationsEnabled() || hasPendingToastRef.current) {
      return;
    }
    hasPendingToastRef.current = true;
    playNotificationSound();
    vibrateShort();
    setToast({ contact, body: randomFakeNotification() });
    translateY.setValue(-120);
    Animated.spring(translateY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }).start();

    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = setTimeout(() => {
      // Auto-dismissed without ever being tapped open — must still clear the
      // pending flag here, otherwise (since the activeContactUid effect is
      // the only other place that clears it) every future notification would
      // be silently suppressed for the rest of the session.
      hasPendingToastRef.current = false;
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
            // App is running and this listener just received the message —
            // that's "delivered" (gray double tick for the sender) even if
            // the user never opens this exact chat room. Independent of the
            // toast/dedup logic below, which only cares about *fresh*
            // arrivals.
            if (!message.deliveredAt) {
              markMessageDelivered(roomId, message.id).catch(() => undefined);
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
            showToast(contact);
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
          <Pressable
            onPress={handlePress}
            style={[styles.toastCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            accessibilityRole="button">
            <View style={[styles.toastBadge, { backgroundColor: theme.identity + '2E' }]}>
              <Text style={styles.toastBadgeIcon}>🎮</Text>
            </View>
            <View style={styles.toastTextWrap}>
              <Text style={[styles.toastTitle, { color: theme.text }]} numberOfLines={1}>
                Mini Oyunlar
              </Text>
              <Text style={[styles.toastSubtitle, { color: theme.textMuted }]} numberOfLines={1}>
                {toast.body}
              </Text>
            </View>
            <View style={[styles.toastDot, { backgroundColor: theme.success }]} />
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
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  toastBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
    fontSize: 14,
    fontWeight: '800',
  },
  toastSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  toastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
});

export default NotificationCenter;
