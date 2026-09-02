const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const youtubeApiKey = defineSecret('YOUTUBE_API_KEY');

/**
 * Server-side proxy for YouTube's search endpoint, used by the "şarkı gönder"
 * feature (see src/services/songService.ts / web-client's copy). Kept behind
 * a callable function instead of calling YouTube directly from the client so
 * the API key lives in Secret Manager, not in the shipped JS bundle/APK.
 *
 * Music-only search: Spotify was the first choice for this feature but its
 * Web API stopped returning `preview_url` (the 30s audio clip) for apps
 * created after Nov 2024 — every track came back with an empty preview, so
 * there was nothing to actually play. YouTube's own embeddable player (with
 * `start`/`end` params, see MessageBubble/ChatRoomScreen on both clients)
 * doesn't have that restriction.
 */
exports.youtubeSearch = onCall({ secrets: [youtubeApiKey] }, async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const q = typeof request.data?.query === 'string' ? request.data.query.trim() : '';
  if (!q) {
    return { tracks: [] };
  }
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${encodeURIComponent(q)}&key=${youtubeApiKey.value()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpsError('internal', `YouTube search failed: ${res.status}`);
  }
  const data = await res.json();
  const tracks = (data.items ?? [])
    .filter(item => item.id?.videoId)
    .map(item => ({
      videoId: item.id.videoId,
      title: item.snippet?.title ?? '',
      channelTitle: item.snippet?.channelTitle ?? '',
      thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
    }));
  return { tracks };
});

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
