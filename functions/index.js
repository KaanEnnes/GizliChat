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
  // Every registered device (phone, PC browser, a second PC, …) gets its own
  // token doc under this subcollection (see fcmService.ts on both clients) —
  // previously all devices shared one `users/{uid}.fcmToken` field and kept
  // overwriting each other's token, which silently starved whichever device
  // synced less often (almost always the PC browser, since the mobile app
  // resyncs its token on every login). Sending to all of them fixes that.
  const tokensSnap = await db.collection('users').doc(recipientUid).collection('fcmTokens').get();
  const tokens = tokensSnap.docs.map(d => d.id);
  // Legacy single-field token, from clients still on a build that predates
  // the subcollection — without this, anyone who hasn't opened the updated
  // app/site yet would silently stop receiving push entirely.
  if (typeof userData?.fcmToken === 'string' && !tokens.includes(userData.fcmToken)) {
    tokens.push(userData.fcmToken);
  }
  console.log('onNewMessage diagnostic', {
    roomId,
    recipientUid,
    userExists: userSnap.exists,
    notificationsEnabled: userData?.notificationsEnabled,
    tokenCount: tokens.length,
  });
  if (!userData || userData.notificationsEnabled === false || tokens.length === 0) {
    console.log('onNewMessage: skipping send (no user/disabled/no tokens)');
    return;
  }

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: {
      roomId,
      senderId: String(message.senderId ?? ''),
    },
    android: { priority: 'high' },
    // Chrome/OS can otherwise deprioritize a data-only web push and deliver
    // it late (or drop it once the browser decides it's low-priority) —
    // Urgency: high asks for immediate delivery, matching android's
    // priority: high above; TTL keeps it queued if the browser is briefly
    // offline instead of being dropped right away.
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });

  const deadTokens = [];
  response.responses.forEach((result, index) => {
    if (result.success) {
      return;
    }
    const code = result.error?.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      deadTokens.push(tokens[index]);
    } else {
      console.error('FCM send failed for one token', result.error);
    }
  });
  if (deadTokens.length > 0) {
    console.log('onNewMessage: clearing dead tokens', { recipientUid, count: deadTokens.length });
    const batch = db.batch();
    deadTokens.forEach(token => batch.delete(db.collection('users').doc(recipientUid).collection('fcmTokens').doc(token)));
    await batch.commit().catch(() => undefined);
  }
  console.log('onNewMessage: push sent', { recipientUid, successCount: response.successCount, failureCount: response.failureCount });
});
