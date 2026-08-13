import { HmacSHA256, enc } from 'crypto-js';
import { StreamVideoClient } from '@stream-io/video-react-native-sdk';
import { STREAM_CONFIG } from '../config/streamConfig';
import { requestCallPermissions } from './permissionsService';
import type { Contact } from './contactService';

function base64UrlEncode(json: unknown): string {
  const base64 = enc.Base64.stringify(enc.Utf8.parse(JSON.stringify(json)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
}

/**
 * Builds a Stream Video user token (HS256 JWT) on-device using the API
 * secret. Only viable because this project has no backend and already
 * accepts client-side-secret trade-offs elsewhere (see streamConfig.ts).
 */
function generateStreamToken(userId: string): string {
  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlEncode({
    user_id: userId,
    iat: Math.floor(Date.now() / 1000) - 60,
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
export function getOrCreateStreamClient(userId: string, username: string): StreamVideoClient {
  return StreamVideoClient.getOrCreateInstance({
    apiKey: STREAM_CONFIG.apiKey,
    user: { id: userId, name: username },
    tokenProvider: () => Promise.resolve(generateStreamToken(userId)),
  });
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
  const callId = [myUid, contact.uid].sort().join('-');
  const call = client.call('default', callId);
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
  if (video) {
    await call.camera.enable();
  } else {
    await call.camera.disable();
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
