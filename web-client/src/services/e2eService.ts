/**
 * End-to-end message encryption using tweetnacl's `nacl.box`
 * (X25519-XSalsa20-Poly1305 authenticated public-key encryption).
 *
 * Web port of the mobile app's `src/services/e2eService.ts` — same wire
 * format, same algorithm, only the private-key storage backend differs
 * (`localStorage` here instead of AsyncStorage) so a phone user and a
 * browser user can decrypt each other's messages transparently. See that
 * file's doc comment (and ObsidianVault/Changelog.md) for the full design
 * rationale; comments here are trimmed to what differs.
 */
import nacl from 'tweetnacl';
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from 'tweetnacl-util';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface EncryptedBlob {
  ciphertext: string;
  nonce: string;
  ciphertextSelf: string;
  nonceSelf: string;
}

const SECRET_KEY_STORAGE_PREFIX = 'e2e_sk_';

let cachedKeyPair: { uid: string; keyPair: KeyPair } | null = null;
const peerPublicKeyCache = new Map<string, Uint8Array>();
const peerPublicKeyFetchInFlight = new Map<string, Promise<Uint8Array | null>>();

function toB64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}
function fromB64(b64: string): Uint8Array {
  return decodeBase64(b64);
}

// localStorage can throw (private-browsing edge cases) — never worth
// crashing the whole app over, same defensive pattern pc-client already
// uses for its theme preference.
function readLocalSecret(uid: string): string | null {
  try {
    return localStorage.getItem(`${SECRET_KEY_STORAGE_PREFIX}${uid}`);
  } catch {
    return null;
  }
}
function writeLocalSecret(uid: string, secretB64: string): void {
  try {
    localStorage.setItem(`${SECRET_KEY_STORAGE_PREFIX}${uid}`, secretB64);
  } catch {
    // Best-effort — if this throws, the key pair still works for the
    // current tab session (kept in the in-memory cache), it just won't
    // survive a reload, which will regenerate it (treated as a "new
    // device" re-key — see ensureKeyPair's case 3 below).
  }
}

/** See the mobile e2eService.ts's ensureKeyPair doc comment for the full 3-case breakdown (existing local key / brand-new account / new device re-key) — identical logic here. */
export async function ensureKeyPair(uid: string): Promise<KeyPair> {
  if (cachedKeyPair && cachedKeyPair.uid === uid) {
    return cachedKeyPair.keyPair;
  }

  const storedSecret = readLocalSecret(uid);
  if (storedSecret) {
    const secretKey = fromB64(storedSecret);
    const keyPair: KeyPair = { secretKey, publicKey: nacl.box.keyPair.fromSecretKey(secretKey).publicKey };
    cachedKeyPair = { uid, keyPair };
    publishPublicKeyIfMissing(uid, keyPair.publicKey).catch(() => undefined);
    return keyPair;
  }

  const generated = nacl.box.keyPair();
  writeLocalSecret(uid, toB64(generated.secretKey));
  await setDoc(doc(db, 'users', uid), { publicKey: toB64(generated.publicKey) }, { merge: true });
  cachedKeyPair = { uid, keyPair: generated };
  peerPublicKeyCache.delete(uid);
  return generated;
}

async function publishPublicKeyIfMissing(uid: string, publicKey: Uint8Array): Promise<void> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists() || typeof snap.data()?.publicKey !== 'string') {
    await setDoc(doc(db, 'users', uid), { publicKey: toB64(publicKey) }, { merge: true });
  }
}

export function getLoadedKeyPair(uid: string): KeyPair | null {
  return cachedKeyPair && cachedKeyPair.uid === uid ? cachedKeyPair.keyPair : null;
}

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

export function otherUidInRoom(roomId: string, myUid: string): string {
  const parts = roomId.split('__');
  return parts.find(uid => uid !== myUid) ?? parts[0] ?? roomId;
}

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

/**
 * Encrypts `plaintext` from `myUid` to a single arbitrary `targetUid`'s
 * published public key (one ciphertext/nonce pair, no "self" copy). Used for
 * the disclosed admin-access third copy (see chatService.ts's
 * buildEncryptedFieldGroup / ADMIN_UID) — deliberately generic (any uid, not
 * just the room peer) so it reuses the same peer-public-key cache as
 * encryptForRoom instead of a parallel lookup. Returns null if either key is
 * unavailable, same fallback contract as encryptForRoom.
 */
export async function encryptToPublicKey(myUid: string, targetUid: string, plaintext: string): Promise<{ ciphertext: string; nonce: string } | null> {
  const myKeyPair = getLoadedKeyPair(myUid) ?? (await ensureKeyPair(myUid));
  const targetPublicKey = await getPeerPublicKey(targetUid);
  if (!targetPublicKey) {
    return null;
  }
  const messageBytes = decodeUTF8(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box(messageBytes, nonce, targetPublicKey, myKeyPair.secretKey);
  return { ciphertext: toB64(ciphertext), nonce: toB64(nonce) };
}

export interface StoredEncryptedRef {
  ciphertext?: string;
  nonce?: string;
  ciphertextSelf?: string;
  nonceSelf?: string;
}

export const UNDECRYPTABLE_PLACEHOLDER = '🔒 Mesaj çözülemedi (başka bir cihazın anahtarına gönderilmiş olabilir)';

export function decryptBlob(ref: StoredEncryptedRef, senderId: string, myUid: string, myKeyPair: KeyPair, peerPublicKey: Uint8Array | null): string | null {
  const isMine = senderId === myUid;
  const ciphertextB64 = isMine ? ref.ciphertextSelf : ref.ciphertext;
  const nonceB64 = isMine ? ref.nonceSelf : ref.nonce;
  if (!ciphertextB64 || !nonceB64) {
    return null;
  }
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
