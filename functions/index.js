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

/**
 * Server-side Open Graph scraper behind a callable, powering the generic link
 * preview cards in chat (og:image / og:title / og:description). Two reasons
 * it isn't just a `fetch` in the client:
 *
 *  1. CORS — the web client's browser cannot fetch arbitrary third-party
 *     sites at all, so it has no other way to read their meta tags.
 *  2. Privacy — this app is a disguised private messenger. Fetching a link
 *     straight from the device would hand the recipient's IP address (and a
 *     "someone opened this chat right now" timing signal) to whoever controls
 *     the linked site, just for rendering a preview. Going through the
 *     function means only Google's egress IP touches the target.
 *
 * Deliberately conservative about what it will fetch — see isBlockedHost().
 */
const PREVIEW_TIMEOUT_MS = 6000;
// Enough to cover <head> on essentially any real page; the body is where the
// weight is and we never need it, so the read is aborted past this.
const PREVIEW_MAX_BYTES = 512 * 1024;

/**
 * SSRF guard: this function will happily fetch any URL a chat participant
 * sends, so it must never be usable as a proxy into Google's internal network
 * or link-local metadata endpoints.
 */
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    return true;
  }
  // Bare IPv6 / IPv4-mapped loopback and the cloud metadata address.
  if (host === '::1' || host === '[::1]' || host === '169.254.169.254' || host === 'metadata.google.internal') {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    // RFC1918 private ranges, loopback, link-local and 0.0.0.0/8.
    if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
      return true;
    }
  }
  return false;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** Reads one <meta> value, accepting either attribute order (content before or after property/name). */
function readMeta(html, names) {
  for (const name of names) {
    const escaped = name.replace(/[:]/g, '\:');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].trim()) {
        return decodeEntities(match[1].trim());
      }
    }
  }
  return undefined;
}

exports.linkPreview = onCall(async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  const raw = typeof request.data?.url === 'string' ? request.data.url.trim() : '';
  if (!raw) {
    throw new HttpsError('invalid-argument', 'url required');
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    throw new HttpsError('invalid-argument', 'invalid url');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new HttpsError('invalid-argument', 'unsupported protocol');
  }
  if (isBlockedHost(target.hostname)) {
    throw new HttpsError('permission-denied', 'blocked host');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
  try {
    const response = await fetch(target.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Many sites only emit og: tags for a recognised crawler UA.
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      return { preview: null };
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('html')) {
      return { preview: null };
    }

    // Streamed with a hard byte cap so a huge (or endless) response can't tie
    // up the function — og: tags live in <head>, well within the cap.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let received = 0;
    while (received < PREVIEW_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.length;
      html += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) {
        break;
      }
    }
    await reader.cancel().catch(() => undefined);

    const image = readMeta(html, ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);
    const title =
      readMeta(html, ['og:title', 'twitter:title']) ||
      decodeEntities((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim()) ||
      undefined;
    const description = readMeta(html, ['og:description', 'twitter:description', 'description']);
    const siteName = readMeta(html, ['og:site_name']);

    if (!title && !image) {
      return { preview: null };
    }
    return {
      preview: {
        url: target.toString(),
        title: title ? title.slice(0, 200) : undefined,
        description: description ? description.slice(0, 300) : undefined,
        // Resolved against the final (post-redirect) URL so a relative
        // og:image path still yields something loadable by the client.
        imageUrl: image ? new URL(image, response.url || target.toString()).toString() : undefined,
        siteName: siteName ? siteName.slice(0, 100) : target.hostname.replace(/^www\./, ''),
      },
    };
  } catch {
    return { preview: null };
  } finally {
    clearTimeout(timeout);
  }
});
