import { HmacSHA256, enc } from 'crypto-js';
import { StreamVideoClient } from '@stream-io/video-react-native-sdk';
import { STREAM_CONFIG } from '../config/streamConfig';
import { requestCallPermissions } from './permissionsService';
import type { Contact } from './contactService';

/** How long an unanswered outgoing call keeps ringing before it cancels itself (see CallScreen). */
export const RINGING_TIMEOUT_MS = 45_000;

/** Token lifetime. Re-minted on demand by the `tokenProvider` below, so this only has to outlive a single call. */
const TOKEN_TTL_SECONDS = 60 * 60 * 24;

function base64UrlEncode(json: unknown): string {
  const base64 = enc.Base64.stringify(enc.Utf8.parse(JSON.stringify(json)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
}

/**
 * Builds a Stream Video user token (HS256 JWT) on-device using the API
 * secret. Only viable because this project has no backend and already
 * accepts client-side-secret trade-offs elsewhere (see streamConfig.ts).
 *
 * The token carries an `exp`: a never-expiring token can't be revoked at all
 * if it leaks, and Stream calls `tokenProvider` again whenever the current
 * one is close to expiry, so a short life costs nothing here.
 */
function generateStreamToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlEncode({
    user_id: userId,
    // Backdated by a minute so a device whose clock runs slightly fast isn't
    // rejected for presenting a token "from the future".
    iat: now - 60,
    exp: now + TOKEN_TTL_SECONDS,
  });
  const unsigned = `${header}.${payload}`;
  const signature = HmacSHA256(unsigned, STREAM_CONFIG.apiSecret)
    .toString(enc.Base64)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/[=]+$/, '');
  return `${unsigned}.${signature}`;
}

/**
 * Stream caches/reuses a single client instance per user id, so calling
 * this from multiple places (the call provider, a "start call" button)
 * with the same uid/username resolves to the same underlying client.
 */
let connectedClient: StreamVideoClient | null = null;

export function getOrCreateStreamClient(userId: string, username: string): StreamVideoClient {
  const client = StreamVideoClient.getOrCreateInstance({
    apiKey: STREAM_CONFIG.apiKey,
    user: { id: userId, name: username },
    tokenProvider: () => Promise.resolve(generateStreamToken(userId)),
  });
  connectedClient = client;
  return client;
}

/**
 * Disconnects the cached client. Without this, signing out left the previous
 * account connected to Stream — still receiving its ring events, still able
 * to pop a full-screen incoming-call UI over the *next* account's session —
 * because `getOrCreateInstance` caches per user id and never tears the old
 * one down on its own.
 */
export async function disconnectStreamClient(): Promise<void> {
  const client = connectedClient;
  connectedClient = null;
  await client?.disconnectUser().catch(() => undefined);
}

/** Stream rejects `getOrCreate` outright (400, "id must be at maximum 64 characters in length") above this. */
const MAX_CALL_ID_LENGTH = 64;

/**
 * A Stream call id is permanent: `getOrCreate` on an id that has already
 * hosted a finished call returns that same, already-ended call object, which
 * simply refuses to ring again. The old id was derived only from the two user
 * ids and the call type, so the *first* voice call to a contact worked and
 * every later one silently failed to ring. The random suffix makes each call
 * a genuinely new call object.
 *
 * Only the first 8 characters of each uid go into the id. Two full 28-char
 * Firebase uids plus the type already came to 63 characters — one under
 * Stream's hard 64-character limit — so appending anything at all to the old
 * format made every call fail with a 400 instead of ringing. The truncated
 * pair is purely a human-readable hint for the Stream dashboard and the
 * chat's `call_<id>` log documents (two different pairs can share a prefix,
 * which is harmless: the random suffix is what makes the id unique, and the
 * call's members are what actually define who is in it).
 */
function buildCallId(myUid: string, otherUid: string, video: boolean): string {
  const [first, second] = [myUid, otherUid].sort();
  const pair = `${first.slice(0, 8)}-${second.slice(0, 8)}`;
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${pair}-${video ? 'v' : 'a'}-${unique}`.slice(0, MAX_CALL_ID_LENGTH);
}

async function startCall(
  myUid: string,
  myUsername: string,
  contact: Contact,
  video: boolean,
): Promise<void> {
  const granted = await requestCallPermissions(video);
  if (!granted) {
    throw new Error(video ? 'Kamera/mikrofon izni verilmedi.' : 'Mikrofon izni verilmedi.');
  }

  const client = getOrCreateStreamClient(myUid, myUsername);
  const call = client.call('default', buildCallId(myUid, contact.uid, video));
  await call.getOrCreate({
    ring: true,
    data: {
      members: [{ user_id: myUid }, { user_id: contact.uid }],
      // Read back on both sides in CallScreen to pick the right audio route
      // (earpiece for voice calls, speaker for video calls) — the callee has
      // no other way to know which kind of call this is before joining.
      custom: { isVideo: video },
    },
  });
  // Camera is enabled here only so the caller sees their own preview while
  // the call rings; CallScreen re-applies this on both devices at join time
  // (local camera state doesn't travel with the call).
  if (video) {
    await call.camera.enable().catch(() => undefined);
  } else {
    await call.camera.disable().catch(() => undefined);
  }
}

/**
 * Both throw on failure (permission denied, network error, Stream API
 * error, ...) instead of swallowing it — previously these only logged a
 * `console.warn`, so tapping the call button while e.g. offline or with a
 * denied permission did visibly *nothing*, which is exactly what "the call
 * button is bugged" reports from silent failures look like. Callers must
 * catch and surface the error.
 */
export function startVoiceCall(myUid: string, myUsername: string, contact: Contact): Promise<void> {
  return startCall(myUid, myUsername, contact, false);
}

export function startVideoCall(myUid: string, myUsername: string, contact: Contact): Promise<void> {
  return startCall(myUid, myUsername, contact, true);
}
