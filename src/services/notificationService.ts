import AsyncStorage from '@react-native-async-storage/async-storage';

// Mirrors soundService's isSoundEnabled/setSoundEnabled pattern: a
// module-level cached flag (read synchronously by NotificationCenter on
// every incoming message) backed by AsyncStorage for persistence.
const NOTIFICATIONS_ENABLED_KEY = 'gizlichat_notifications_enabled';
let notificationsEnabled = true;

AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY).then(value => {
  if (value === '0') {
    notificationsEnabled = false;
  }
});

export function isNotificationsEnabled(): boolean {
  return notificationsEnabled;
}

/**
 * Same flag, but read fresh from AsyncStorage instead of the module-level
 * cache. Needed by fcmService's background message handler: that handler can
 * run in a fresh headless JS instance (app fully killed) where this module
 * has only just been loaded and the cache-priming `getItem` above may not
 * have resolved yet — trusting the cached `notificationsEnabled` there risks
 * showing a notification the user turned off, or vice versa.
 */
export async function isNotificationsEnabledAsync(): Promise<boolean> {
  const value = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
  return value !== '0';
}

export function setNotificationsEnabled(enabled: boolean): void {
  notificationsEnabled = enabled;
  AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? '1' : '0').catch(() => undefined);
}

// Deliberately generic, game-flavored copy — no sender name or message
// content ever surfaces in a notification, so it reveals nothing about the
// disguise underneath even if someone else is glancing at the screen. One is
// picked at random per notification. Shared between NotificationCenter's
// in-app toast (foreground) and fcmService's real push (background/killed)
// so both look identical.
const FAKE_GAME_NOTIFICATIONS = [
  'Günlük ödülünü almayı unutma!',
  'Yeni bir yüksek skor kırıldı!',
  'Bugünkü meydan okuma seni bekliyor.',
  'Enerjin doldu, hemen oyna!',
  'Arkadaşın seni skor tablosunda geçti!',
  'Yeni bir mini oyun eklendi, dene!',
];

export function randomFakeNotification(): string {
  return FAKE_GAME_NOTIFICATIONS[Math.floor(Math.random() * FAKE_GAME_NOTIFICATIONS.length)];
}

/**
 * Module-level mirror of "which contact's chat room is currently open on
 * screen", kept in sync by AppNavigator alongside the `activeContactUid` it
 * already passes to NotificationCenter. NotificationCenter's own Firestore
 * listener already skips the in-app toast for the active room, but
 * fcmService's foreground FCM listener (`onMessage`) is a separate code path
 * with no view into React state — without this, a message from the contact
 * you're actively chatting with still popped a real system notification even
 * though the in-app toast correctly stayed silent.
 */
let activeChatUid: string | null = null;

export function setActiveChatUid(uid: string | null): void {
  activeChatUid = uid;
}

export function isActiveChatUid(uid: string): boolean {
  return activeChatUid === uid;
}
