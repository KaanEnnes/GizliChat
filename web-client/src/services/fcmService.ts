import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';
import { FCM_VAPID_KEY } from '../config/messagingConfig';
import { isActiveChatUid, isNotificationsEnabled, randomFakeNotification } from './notificationService';

/** Same disguised copy as the mobile app's fake-game push (GameHubScreen is the "app" a bystander sees). */
const NOTIFICATION_TITLE = 'Mini Oyunlar';

/**
 * Stored per-token (doc id = the token itself) under a subcollection instead
 * of a single `users/{uid}.fcmToken` field — a single shared field meant this
 * browser's token and the mobile app's token constantly overwrote each other
 * every time either re-registered, so whichever synced last silently stole
 * the other's push. This was almost certainly why PC notifications "mostly
 * don't arrive": the mobile app resyncs its token far more often (every
 * login) than a browser tab does. See functions/index.js's onNewMessage,
 * which now fans out to every token in this subcollection.
 */
async function saveFcmToken(uid: string, token: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'fcmTokens', token),
    { platform: 'web', updatedAt: Date.now() },
    { merge: true },
  );
}

/**
 * Mirrors the local (localStorage) notifications-on/off flag onto this
 * user's Firestore profile — the Cloud Function that sends the push
 * (functions/index.js) runs server-side and checks
 * `users/{uid}.notificationsEnabled` before sending.
 */
export function syncNotificationsEnabledToServer(uid: string, enabled: boolean): void {
  setDoc(doc(db, 'users', uid), { notificationsEnabled: enabled }, { merge: true }).catch(() => undefined);
}

/**
 * Call once after login (see App.tsx). Registers the FCM service worker,
 * requests browser notification permission, saves this browser's push token
 * to Firestore, and wires the foreground message listener (the service
 * worker's own `onBackgroundMessage` handles the tab-hidden/closed case —
 * see public/firebase-messaging-sw.js). No-ops quietly if the browser
 * doesn't support push (e.g. Safari without the right entitlements, or
 * running outside a secure context) since a missed push is never fatal —
 * the message itself is already safely in Firestore.
 */
export async function initFcm(uid: string): Promise<void> {
  if (!(await isSupported().catch(() => false))) {
    return;
  }
  if (typeof Notification === 'undefined') {
    return;
  }

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  syncNotificationsEnabledToServer(uid, isNotificationsEnabled());
  if (permission !== 'granted') {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging: Messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if (token) {
      await saveFcmToken(uid, token);
    }

    // Data-only messages never auto-display anything on their own — this is
    // what makes them visible while the tab is open/focused. The service
    // worker's onBackgroundMessage covers the hidden-tab/closed-browser case.
    onMessage(messaging, payload => {
      const senderId = payload.data?.senderId;
      if (typeof senderId !== 'string' || isActiveChatUid(senderId) || !isNotificationsEnabled()) {
        return;
      }
      new Notification(NOTIFICATION_TITLE, { body: randomFakeNotification() });
    });
  } catch (error) {
    console.log('[fcmService] push setup failed:', error);
  }
}
