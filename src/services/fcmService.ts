import { Platform } from 'react-native';
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  setBackgroundMessageHandler,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { requestNotificationPermission } from './permissionsService';
import {
  isActiveChatUid,
  isNotificationsEnabled,
  isNotificationsEnabledAsync,
  randomFakeNotification,
} from './notificationService';

/** Same disguised copy as the in-app toast (GameHubScreen is the "app" a bystander sees). */
const NOTIFICATION_TITLE = 'Mini Oyunlar';
// Android locks a channel's sound/importance in at creation time and never
// re-reads them on later `createChannel` calls with the same id — bumping
// the id (rather than mutating the existing "game_notifications" channel)
// is the only way to actually change the sound on devices that already had
// the old channel created (i.e. anyone who installed an earlier build).
const CHANNEL_ID = 'game_notifications_v2';

/**
 * One notifee channel, created once (idempotent — safe to call repeatedly).
 * Must exist before `displayNotification` is called from *any* JS context,
 * including the headless one `setBackgroundMessageHandler` runs in when the
 * app is fully killed — hence this is also called from index.js, not just
 * here.
 */
export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Mini Oyunlar bildirimleri',
    importance: AndroidImportance.HIGH,
    // Same boosted sfx as the in-app toast (soundService.playNotificationSound,
    // android/app/src/main/res/raw/sfx_notification.wav) instead of the
    // system default — resource name only, no extension, matching how
    // react-native-sound already resolves it. Channel sound is fixed at
    // creation time on Android (changing it later requires a new channel
    // id), which is fine here since this channel is only ever created once.
    sound: 'sfx_notification',
  });
}

async function saveFcmToken(uid: string, token: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { fcmToken: token }, { merge: true });
}

/**
 * Mirrors the local (AsyncStorage) notifications-on/off flag onto this
 * user's Firestore profile, since the Cloud Function that actually sends the
 * push (functions/index.js) runs server-side and has no access to
 * AsyncStorage — it checks `users/{uid}.notificationsEnabled` before
 * sending. Call this both right after login (`initFcm`) and every time the
 * Settings toggle changes.
 */
export function syncNotificationsEnabledToServer(enabled: boolean): void {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return;
  }
  setDoc(doc(db, 'users', uid), { notificationsEnabled: enabled }, { merge: true }).catch(() => undefined);
}

/**
 * Shows (or, for a sender already showing one, replaces — see the stable
 * `id`) the fake-game notification for a message from `senderId`. Shared by
 * the foreground handler below and index.js's background/killed handler so
 * both paths render identically.
 */
export async function displayFakeGameNotification(senderId: string): Promise<void> {
  await ensureNotificationChannel();
  await notifee.displayNotification({
    // Stable per-sender id: a burst of messages from the same contact
    // collapses into one updated notification instead of stacking multiple
    // — mirrors NotificationCenter's "at most one pending toast" behavior.
    id: `chat_${senderId}`,
    title: NOTIFICATION_TITLE,
    body: randomFakeNotification(),
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: 'default', launchActivity: 'default' },
      // Explicit timestamp + showTimestamp: without this, Android doesn't
      // render a relative "X dk önce" age in the notification shade — a
      // burst of messages updating the same notification (same `id`, above)
      // also bumps this each time, so the age always reflects the latest
      // message rather than when the notification first appeared.
      timestamp: Date.now(),
      showTimestamp: true,
    },
  });
}

/**
 * Call once after login (see AppNavigator). Requests the runtime
 * notification permission, registers/refreshes this device's FCM token in
 * Firestore, pushes the current notifications-on/off preference to the
 * server, and wires the foreground message listener (background/killed is
 * handled separately in index.js, outside the React tree). Returns a cleanup
 * function for when the user logs out.
 */
export async function initFcm(uid: string): Promise<() => void> {
  if (Platform.OS !== 'android') {
    return () => undefined;
  }
  await ensureNotificationChannel();

  const granted = await requestNotificationPermission();
  console.log('[fcmService] notification permission granted:', granted);
  syncNotificationsEnabledToServer(isNotificationsEnabled());

  const messagingInstance = getMessaging();

  if (granted) {
    try {
      const token = await getToken(messagingInstance);
      console.log('[fcmService] got token:', token.slice(0, 12) + '…');
      await saveFcmToken(uid, token);
      console.log('[fcmService] token saved to Firestore for uid', uid);
    } catch (error) {
      // Non-fatal — this device just won't receive push until the next
      // successful getToken() call (e.g. next login), foreground in-app
      // toasts still work regardless.
      console.log('[fcmService] getToken/saveFcmToken failed:', error);
    }
  }

  const unsubscribeTokenRefresh = onTokenRefresh(messagingInstance, token => {
    saveFcmToken(uid, token).catch(() => undefined);
  });

  // Data-only messages (see functions/index.js — no `notification` field)
  // never auto-display anything, in foreground or background, so this
  // foreground listener is what makes them visible while the app is open.
  // NotificationCenter's own Firestore listener already covers the
  // foreground case for a room the user *isn't* currently looking at, so
  // this mostly matters when the app is foregrounded but, e.g., mid a heavy
  // re-render — kept for correctness/symmetry with the background handler.
  const unsubscribeOnMessage = onMessage(messagingInstance, async (remoteMessage: RemoteMessage) => {
    const senderId = remoteMessage.data?.senderId;
    if (typeof senderId !== 'string' || isActiveChatUid(senderId) || !(await isNotificationsEnabledAsync())) {
      return;
    }
    await displayFakeGameNotification(senderId);
  });

  return () => {
    unsubscribeTokenRefresh();
    unsubscribeOnMessage();
  };
}

/**
 * Registered once at app startup (index.js), never inside a mounted
 * component: this is how RN Firebase delivers a data message while the app
 * is backgrounded OR fully killed (a fresh, short-lived headless JS instance
 * with no React tree). EventType.PRESS is handled here too — notifee
 * requires *some* background handler to be registered or it logs a startup
 * warning; a press just needs the default launch behavior already set via
 * `pressAction: { launchActivity: 'default' }`, so there's nothing extra to
 * do beyond acknowledging the event.
 */
export function registerBackgroundHandlers(): void {
  if (Platform.OS !== 'android') {
    return;
  }
  setBackgroundMessageHandler(getMessaging(), async (remoteMessage: RemoteMessage) => {
    const senderId = remoteMessage.data?.senderId;
    if (typeof senderId !== 'string' || !(await isNotificationsEnabledAsync())) {
      return;
    }
    await displayFakeGameNotification(senderId);
  });

  notifee.onBackgroundEvent(async ({ type }) => {
    if (type === EventType.PRESS) {
      // No deep link into the chat room on purpose: this app's real UI is
      // gated behind the hidden gesture + login screen (see
      // ObsidianVault/02-Screens-and-Features.md) even when already
      // authenticated on this device. Jumping straight into a chat room from
      // a cold-start notification tap would bypass that and defeat the
      // disguise — `launchActivity: 'default'` already just opens the app
      // normally (GameHubScreen), which is all we want here.
    }
  });
}
