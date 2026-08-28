/**
 * End-to-end message encryption using tweetnacl's `nacl.box`
 * (X25519-XSalsa20-Poly1305 authenticated public-key encryption). Pure JS,
 * no native module — works identically on this RN app, web-client, and
 * pc-client's plain-browser module script, which is why it was chosen (see
 * ObsidianVault/Changelog.md for the full rationale).
 *
 * Every account gets one X25519 key pair per device:
 *  - public key -> published to `users/{uid}.publicKey` (base64), readable
 *    by anyone (needed so the *other* room member can encrypt to it).
 *  - private key -> NEVER leaves this device. Stored only in AsyncStorage
 *    under `e2e_sk_<uid>`.
 *
 * Rooms are always exactly 2 people (see getRoomId in chatService.ts), so
 * "the recipient" is simply "the other uid parsed out of the roomId".
 *
 * Wire format (see chatService.ts): a message carries `encrypted: true` plus
 * base64 `encText`/`encNonce` (encrypted to the OTHER room member) and
 * `encTextSelf`/`encNonceSelf` (encrypted to the SENDER's own public key, so
 * the sender can still read their own sent history later — nacl.box isn't
 * symmetric, a box made for the recipient can't be opened by the sender's
 * own key). `text` is left `''` on encrypted messages; old pre-E2E messages
 * have no `encrypted` flag and keep their plaintext `text` — those are
 * rendered as-is, never "decrypted".
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
// Must be imported before `nacl` anywhere in the app so `crypto.getRandomValues`
// exists — nacl.box.keyPair()/nacl.randomBytes() throw without it on RN.
// The actual side-effecting import lives in index.js (entry point, runs
// before anything else); this file just leans on that having already run.
import nacl from 'tweetnacl';
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from 'tweetnacl-util';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/** Generic "encrypted twice" blob — once to the other room member, once to the sender's own key (see encryptForRoom). Field names are generic on purpose: chatService.ts maps these onto either the message's own `enc*` fields or the embedded `replyTo`'s `enc*` fields — same shape, two different homes on the stored doc. */
export interface EncryptedBlob {
  ciphertext: string;
  nonce: string;
  ciphertextSelf: string;
  nonceSelf: string;
}

const SECRET_KEY_STORAGE_PREFIX = 'e2e_sk_';

// In-memory caches so we don't hit AsyncStorage/Firestore on every message.
let cachedKeyPair: { uid: string; keyPair: KeyPair } | null = null;
const peerPublicKeyCache = new Map<string, Uint8Array>();
const peerPublicKeyFetchInFlight = new Map<string, Promise<Uint8Array | null>>();

function toB64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}
function fromB64(b64: string): Uint8Array {
  return decodeBase64(b64);
}

/**
 * Ensures this device has a usable key pair for `uid` and that Firestore has
 * a public key published for it, then returns the pair. Call once at
 * login/app-start (see AppNavigator).
 *
 * Three cases:
 * 1. Local secret key already stored on this device -> reuse it as-is.
 * 2. No local secret key, and Firestore has no publicKey yet for this
 *    account -> brand-new account (or an existing account's very first
 *    login after this feature shipped). Generate a fresh pair, store the
 *    secret locally, publish the public key.
 * 3. No local secret key, but Firestore already HAS a publicKey -> this is
 *    a new device for an existing account (e.g. second phone). There is no
 *    way to recover the original private key — it never left the first
 *    device, by design. We generate a brand-new pair on this device and
 *    OVERWRITE the Firestore publicKey with it. Consequence: any message
 *    encrypted to the OLD public key (sent by the other room member before
 *    this device's switch) can no longer be decrypted by this device — it
 *    renders as an "cannot decrypt (sent to a different device's key)"
 *    placeholder, not a crash. Going-forward messages work fine since the
 *    new public key is now the current one for this account.
 */
export async function ensureKeyPair(uid: string): Promise<KeyPair> {
  if (cachedKeyPair && cachedKeyPair.uid === uid) {
    return cachedKeyPair.keyPair;
  }

  const storageKey = `${SECRET_KEY_STORAGE_PREFIX}${uid}`;
  const storedSecret = await AsyncStorage.getItem(storageKey);
  if (storedSecret) {
    const secretKey = fromB64(storedSecret);
    const keyPair: KeyPair = { secretKey, publicKey: nacl.box.keyPair.fromSecretKey(secretKey).publicKey };
    cachedKeyPair = { uid, keyPair };
    // Best-effort: make sure Firestore's copy matches (covers the case
    // where a previous publish attempt failed after the key was already
    // saved locally).
    publishPublicKeyIfMissing(uid, keyPair.publicKey).catch(() => undefined);
    return keyPair;
  }

  // No local secret. Generate a fresh pair regardless of whether Firestore
  // already has one (new account vs. new device both end up here, and both
  // are handled the same way: generate + publish/overwrite).
  const generated = nacl.box.keyPair();
  await AsyncStorage.setItem(storageKey, toB64(generated.secretKey));
  await setDoc(doc(db, 'users', uid), { publicKey: toB64(generated.publicKey) }, { merge: true });
  cachedKeyPair = { uid, keyPair: generated };
  // This device is now authoritative for `uid`'s public key — drop any
  // stale cached copy of it (relevant if we're re-keying on the same
  // session, e.g. after logout/login as the same account without ever
  // restarting the app).
  peerPublicKeyCache.delete(uid);
  return generated;
}

async function publishPublicKeyIfMissing(uid: string, publicKey: Uint8Array): Promise<void> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists() || typeof snap.data()?.publicKey !== 'string') {
    await setDoc(doc(db, 'users', uid), { publicKey: toB64(publicKey) }, { merge: true });
  }
}

/** Synchronous accessor for the currently-loaded key pair, if `ensureKeyPair` has already resolved for `uid`. */
export function getLoadedKeyPair(uid: string): KeyPair | null {
  return cachedKeyPair && cachedKeyPair.uid === uid ? cachedKeyPair.keyPair : null;
}

/** Fetches (and caches in-memory) another user's published public key. Returns null if they don't have one yet (pre-E2E account that hasn't logged in since this shipped). */
export async function getPeerPublicKey(uid: string): Promise<Uint8Array | null> {
  const cached = peerPublicKeyCache.get(uid);
  if (cached) {
    return cached;
  }
  const inFlight = peerPublicKeyFetchInFlight.get(uid);
  if (inFlight) {
    return inFlight;
  }
  const fetchPromise = (async () => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const b64 = snap.exists() ? snap.data()?.publicKey : undefined;
      if (typeof b64 !== 'string' || !b64) {
        return null;
      }
      const publicKey = fromB64(b64);
      peerPublicKeyCache.set(uid, publicKey);
      return publicKey;
    } catch {
      return null;
    } finally {
      peerPublicKeyFetchInFlight.delete(uid);
    }
  })();
  peerPublicKeyFetchInFlight.set(uid, fetchPromise);
  return fetchPromise;
}

/** Parses the other room member's uid out of a `roomId` (`[uidA, uidB].sort().join('__')`, see getRoomId in chatService.ts). */
export function otherUidInRoom(roomId: string, myUid: string): string {
  const parts = roomId.split('__');
  return parts.find(uid => uid !== myUid) ?? parts[0] ?? roomId;
}

/**
 * Encrypts `plaintext` for a room: once to the other member's public key
 * (`encText`/`encNonce`) and once to the sender's own public key
 * (`encTextSelf`/`encNonceSelf`) so the sender can re-read their own sent
 * history later. Returns null if either key is unavailable (my own key pair
 * not loaded yet, or the peer has never published a public key) — callers
 * fall back to legacy plaintext storage in that case.
 */
export async function encryptForRoom(roomId: string, myUid: string, plaintext: string): Promise<EncryptedBlob | null> {
  const myKeyPair = getLoadedKeyPair(myUid) ?? (await ensureKeyPair(myUid));
  const peerUid = otherUidInRoom(roomId, myUid);
  const peerPublicKey = await getPeerPublicKey(peerUid);
  if (!peerPublicKey) {
    return null;
  }
  const messageBytes = decodeUTF8(plaintext);

  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(messageBytes, nonce, peerPublicKey, myKeyPair.secretKey);

  const selfNonce = nacl.randomBytes(nacl.box.nonceLength);
  const selfCiphertext = nacl.box(messageBytes, selfNonce, myKeyPair.publicKey, myKeyPair.secretKey);

  return {
    ciphertext: toB64(ciphertext),
    nonce: toB64(nonce),
    ciphertextSelf: toB64(selfCiphertext),
    nonceSelf: toB64(selfNonce),
  };
}

/** The two ciphertext/nonce pairs for one encrypted field on a stored doc — see EncryptedBlob. `undefined` fields mean "not encrypted" (legacy plaintext) or "missing" (decrypt will fail gracefully). */
export interface StoredEncryptedRef {
  ciphertext?: string;
  nonce?: string;
  ciphertextSelf?: string;
  nonceSelf?: string;
}

export const UNDECRYPTABLE_PLACEHOLDER = '🔒 Mesaj çözülemedi (başka bir cihazın anahtarına gönderilmiş olabilir)';

/**
 * Decrypts one stored ciphertext/nonce pair. Returns null (never throws) if
 * decryption fails — e.g. this device generated a new key pair after a "new
 * device" re-key and the message was sent to the old public key (see
 * ensureKeyPair's case 3 above), or the fields are simply missing. Callers
 * that need a fallback plaintext string should use UNDECRYPTABLE_PLACEHOLDER.
 */
export function decryptBlob(ref: StoredEncryptedRef, senderId: string, myUid: string, myKeyPair: KeyPair, peerPublicKey: Uint8Array | null): string | null {
  const isMine = senderId === myUid;
  const ciphertextB64 = isMine ? ref.ciphertextSelf : ref.ciphertext;
  const nonceB64 = isMine ? ref.nonceSelf : ref.nonce;
  if (!ciphertextB64 || !nonceB64) {
    return null;
  }
  // Opening our own "encrypt to self" box also uses our own public key as
  // the "their" side — scalarmult(mySecret, myPublic) is the same shared
  // secret regardless of which side calls it "mine" vs. "theirs".
  const theirPublicKeyForOpen = isMine ? myKeyPair.publicKey : peerPublicKey;
  if (!theirPublicKeyForOpen) {
    return null;
  }
  try {
    const opened = nacl.box.open(fromB64(ciphertextB64), fromB64(nonceB64), theirPublicKeyForOpen, myKeyPair.secretKey);
    return opened ? encodeUTF8(opened) : null;
  } catch {
    return null;
  }
}

/** Test/dev helper: clears in-memory caches (not AsyncStorage) — not used in production code paths. */
export function _resetInMemoryCachesForTests(): void {
  cachedKeyPair = null;
  peerPublicKeyCache.clear();
  peerPublicKeyFetchInFlight.clear();
}
