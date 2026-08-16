const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

/**
 * The server-side half of the push notification system (client half:
 * src/services/fcmService.ts). Fires on every new chat message and sends a
 * data-only FCM push to the *other* room member — data-only (no
 * `notification` field) so the client fully controls what's shown, same
 * fake-game copy either way it renders (foreground toast vs. this push),
 * see notificationService.randomFakeNotification. Never includes the
 * message text or sender name in the push payload itself, matching the
 * app's disguise design (nothing chat-related should be visible even to
 * someone inspecting the notification on the lock screen).
 */
exports.onNewMessage = onDocumentCreated('rooms/{roomId}/messages/{messageId}', async event => {
  const message = event.data?.data();
  if (!message || message.type === 'call') {
    // Call log entries already have their own signal (Stream's ringing
    // push, separate system) — no fake-game notification for those.
    return;
  }

  const { roomId } = event.params;
  const parts = roomId.split('__');
  if (parts.length !== 2) {
    return;
  }
  const recipientUid = parts.find(uid => uid !== message.senderId);
  if (!recipientUid) {
    return;
  }

  const db = getFirestore();
  const userSnap = await db.collection('users').doc(recipientUid).get();
  const userData = userSnap.data();
  console.log('onNewMessage diagnostic', {
    roomId,
    recipientUid,
    userExists: userSnap.exists,
    notificationsEnabled: userData?.notificationsEnabled,
    hasFcmToken: Boolean(userData?.fcmToken),
  });
  if (!userData || userData.notificationsEnabled === false || !userData.fcmToken) {
    console.log('onNewMessage: skipping send (no user/disabled/no token)');
    return;
  }

  try {
    await getMessaging().send({
      token: userData.fcmToken,
      data: {
        roomId,
        senderId: String(message.senderId ?? ''),
      },
      android: { priority: 'high' },
    });
    console.log('onNewMessage: push sent successfully', { recipientUid });
  } catch (error) {
    // An invalid/expired token is expected eventually (reinstall, token
    // rotation) — clear it so future messages don't keep retrying a dead
    // token. Any other error is just logged; a missed push isn't critical,
    // the message itself is already safely in Firestore.
    if (error && (error.code === 'messaging/registration-token-not-registered' || error.code === 'messaging/invalid-registration-token')) {
      console.log('onNewMessage: token invalid, clearing it', { recipientUid, code: error.code });
      await db.collection('users').doc(recipientUid).update({ fcmToken: null }).catch(() => undefined);
    } else {
      console.error('FCM send failed', error);
    }
  }
});
