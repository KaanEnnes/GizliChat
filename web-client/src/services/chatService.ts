import {
  addDoc,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  decryptBlob,
  encryptForRoom,
  ensureKeyPair,
  getLoadedKeyPair,
  getPeerPublicKey,
  type KeyPair,
  otherUidInRoom,
  type StoredEncryptedRef,
  UNDECRYPTABLE_PLACEHOLDER,
} from './e2eService';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'call';

export interface ChatMessage {
  id: string;
  type: MessageType;
  text: string;
  senderId: string;
  createdAt: number;
  mediaUrl?: string;
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  callVideo?: boolean;
  callStatus?: 'completed' | 'missed';
  reactions?: Record<string, string>;
  pending?: boolean;
  deliveredAt?: number;
  readAt?: number;
  editedAt?: number;
  deleted?: boolean;
  deletedFor?: string[];
  replyTo?: {
    messageId: string;
    text: string;
    senderId: string;
    type: MessageType;
  };
}

/** What e2eService needs to decrypt any message/replyTo in a room — see buildDecryptContext. */
interface DecryptContext {
  myUid: string;
  myKeyPair: KeyPair;
  peerPublicKey: Uint8Array | null;
}

async function buildDecryptContext(roomId: string, myUid: string): Promise<DecryptContext> {
  const myKeyPair = getLoadedKeyPair(myUid) ?? (await ensureKeyPair(myUid));
  const peerUid = otherUidInRoom(roomId, myUid);
  const peerPublicKey = await getPeerPublicKey(peerUid);
  return { myUid, myKeyPair, peerPublicKey };
}

function resolveEncryptedString(encrypted: boolean, plain: string, ref: StoredEncryptedRef, senderId: string, ctx: DecryptContext): string {
  if (!encrypted) {
    return plain;
  }
  return decryptBlob(ref, senderId, ctx.myUid, ctx.myKeyPair, ctx.peerPublicKey) ?? UNDECRYPTABLE_PLACEHOLDER;
}

const ROOMS_COLLECTION = 'rooms';
const MESSAGES_SUBCOLLECTION = 'messages';

export const INITIAL_MESSAGE_LIMIT = 30;
export const MESSAGE_LIMIT_STEP = 30;
export const MAX_MESSAGE_LIMIT = 300;

/** Deterministic room id for a pair of users — identical algorithm to the mobile app, so a phone user and a browser user land in the same room. */
export function getRoomId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('__');
}

function docToMessage(
  docSnap: {
    id: string;
    data: (options?: { serverTimestamps?: 'estimate' | 'previous' | 'none' }) => Record<string, unknown>;
    metadata: { hasPendingWrites: boolean };
  },
  ctx: DecryptContext,
): ChatMessage {
  const data = docSnap.data({ serverTimestamps: 'estimate' });
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();
  const type = (data.type as MessageType) || 'text';
  const senderId = typeof data.senderId === 'string' ? data.senderId : '';
  const encrypted = data.encrypted === true;

  const text = resolveEncryptedString(
    encrypted,
    typeof data.text === 'string' ? data.text : '',
    { ciphertext: data.encText as string, nonce: data.encNonce as string, ciphertextSelf: data.encTextSelf as string, nonceSelf: data.encNonceSelf as string },
    senderId,
    ctx,
  );

  // mediaUrl encryption only applies to image/audio (inline base64 data
  // URIs) — video stays a plain Storage URL, out of scope for this pass.
  let mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined;
  if (encrypted && (type === 'image' || type === 'audio') && (data.encMediaUrl || data.encMediaUrlSelf)) {
    const decryptedMedia = decryptBlob(
      { ciphertext: data.encMediaUrl as string, nonce: data.encMediaUrlNonce as string, ciphertextSelf: data.encMediaUrlSelf as string, nonceSelf: data.encMediaUrlNonceSelf as string },
      senderId,
      ctx.myUid,
      ctx.myKeyPair,
      ctx.peerPublicKey,
    );
    mediaUrl = decryptedMedia ?? undefined;
  }

  const rawReplyTo = typeof data.replyTo === 'object' && data.replyTo !== null ? (data.replyTo as Record<string, unknown>) : undefined;
  const replyTo: ChatMessage['replyTo'] = rawReplyTo
    ? {
        messageId: typeof rawReplyTo.messageId === 'string' ? rawReplyTo.messageId : '',
        type: (rawReplyTo.type as MessageType) || 'text',
        // Display label only, not the encryption actor — see the mobile
        // chatService.ts's identical note. The ciphertext was produced by
        // this outer message's sender (`senderId`), so decryption must use
        // `senderId`, not `rawReplyTo.senderId`.
        senderId: typeof rawReplyTo.senderId === 'string' ? rawReplyTo.senderId : '',
        text: resolveEncryptedString(
          rawReplyTo.encrypted === true,
          typeof rawReplyTo.text === 'string' ? rawReplyTo.text : '',
          {
            ciphertext: rawReplyTo.encText as string,
            nonce: rawReplyTo.encNonce as string,
            ciphertextSelf: rawReplyTo.encTextSelf as string,
            nonceSelf: rawReplyTo.encNonceSelf as string,
          },
          senderId,
          ctx,
        ),
      }
    : undefined;

  return {
    id: docSnap.id,
    type,
    text,
    senderId,
    createdAt,
    mediaUrl,
    fileName: typeof data.fileName === 'string' ? data.fileName : undefined,
    fileSize: typeof data.fileSize === 'number' ? data.fileSize : undefined,
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
    callVideo: typeof data.callVideo === 'boolean' ? data.callVideo : undefined,
    callStatus:
      data.callStatus === 'completed' || data.callStatus === 'missed' ? (data.callStatus as 'completed' | 'missed') : undefined,
    reactions: typeof data.reactions === 'object' && data.reactions !== null ? (data.reactions as Record<string, string>) : undefined,
    pending: docSnap.metadata.hasPendingWrites,
    deliveredAt: data.deliveredAt instanceof Timestamp ? data.deliveredAt.toMillis() : undefined,
    readAt: data.readAt instanceof Timestamp ? data.readAt.toMillis() : undefined,
    editedAt: data.editedAt instanceof Timestamp ? data.editedAt.toMillis() : undefined,
    deleted: data.deleted === true,
    deletedFor: Array.isArray(data.deletedFor) ? (data.deletedFor as string[]) : undefined,
    replyTo,
  };
}

export function subscribeToMessages(
  roomId: string,
  limitCount: number,
  myUid: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const messagesQuery = query(
    collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  return onSnapshot(
    messagesQuery,
    snapshot => {
      buildDecryptContext(roomId, myUid).then(ctx => {
        onMessages(
          snapshot.docs
            .map(d => docToMessage(d, ctx))
            .filter(message => !message.deletedFor?.includes(myUid))
            .reverse(),
        );
      });
    },
    error => onError(error as Error),
  );
}

export function subscribeToLatestMessage(roomId: string, myUid: string, onMessage: (message: ChatMessage | null) => void): Unsubscribe {
  // Widened past 1 so a message deleted-for-me can be skipped client-side.
  const latestQuery = query(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), orderBy('createdAt', 'desc'), limit(20));
  return onSnapshot(
    latestQuery,
    snapshot => {
      buildDecryptContext(roomId, myUid).then(ctx => {
        const found = snapshot.docs.map(d => docToMessage(d, ctx)).find(message => !message.deletedFor?.includes(myUid));
        onMessage(found ?? null);
      });
    },
    () => onMessage(null),
  );
}

export async function setMessageReaction(roomId: string, messageId: string, uid: string, emoji: string | null): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { [`reactions.${uid}`]: emoji === null ? deleteField() : emoji });
}

export async function markMessageDelivered(roomId: string, messageId: string): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { deliveredAt: serverTimestamp() });
}

export async function markMessageRead(roomId: string, messageId: string): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { readAt: serverTimestamp(), deliveredAt: serverTimestamp() });
}

/** See the mobile chatService.ts's identical helper — falls back to plain `text` if the peer has no published public key yet (hasn't opened the app since E2E shipped). */
async function buildEncryptedFieldGroup(roomId: string, senderId: string, plaintext: string): Promise<Record<string, unknown>> {
  const blob = await encryptForRoom(roomId, senderId, plaintext);
  if (!blob) {
    return { text: plaintext };
  }
  return {
    text: '',
    encrypted: true,
    encText: blob.ciphertext,
    encNonce: blob.nonce,
    encTextSelf: blob.ciphertextSelf,
    encNonceSelf: blob.nonceSelf,
  };
}

// `replyTo.senderId` is a display label (whose message is being quoted),
// not who is encrypting — see docToMessage's identical note. The ciphertext
// is always produced by the CURRENT sender of this new message.
async function buildEncryptedReplyTo(roomId: string, senderId: string, replyTo: NonNullable<ChatMessage['replyTo']>): Promise<Record<string, unknown>> {
  const fields = await buildEncryptedFieldGroup(roomId, senderId, replyTo.text);
  return { messageId: replyTo.messageId, type: replyTo.type, senderId: replyTo.senderId, ...fields };
}

export async function sendMessage(
  roomId: string,
  text: string,
  senderId: string,
  replyTo?: ChatMessage['replyTo'],
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  const [textFields, replyToPayload] = await Promise.all([
    buildEncryptedFieldGroup(roomId, senderId, trimmed),
    replyTo ? buildEncryptedReplyTo(roomId, senderId, replyTo) : Promise.resolve(undefined),
  ]);
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type: 'text',
    ...textFields,
    senderId,
    createdAt: serverTimestamp(),
    ...(replyToPayload ? { replyTo: replyToPayload } : {}),
  });
}

/** `mediaUrl` is encrypted the same way as text for image/audio only (inline base64 data URIs) — video stays a plain Storage URL, out of scope for this pass. See the mobile chatService.ts's sendMediaMessage for the full rationale. */
export async function sendMediaMessage(
  roomId: string,
  senderId: string,
  type: Exclude<MessageType, 'text' | 'file' | 'call'>,
  mediaUrl: string,
  durationSeconds?: number,
): Promise<void> {
  const shouldEncryptMedia = type === 'image' || type === 'audio';
  const blob = shouldEncryptMedia ? await encryptForRoom(roomId, senderId, mediaUrl) : null;
  const mediaFields = blob
    ? {
        encrypted: true,
        encMediaUrl: blob.ciphertext,
        encMediaUrlNonce: blob.nonce,
        encMediaUrlSelf: blob.ciphertextSelf,
        encMediaUrlNonceSelf: blob.nonceSelf,
      }
    : { mediaUrl };
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type,
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    ...mediaFields,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  });
}

export async function sendFileMessage(roomId: string, senderId: string, mediaUrl: string, fileName: string, fileSize: number): Promise<void> {
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type: 'file',
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    mediaUrl,
    fileName,
    fileSize,
  });
}

/** `myUid` is always the message's own sender (firestore.rules rejects anyone else editing) — needed here to (re)encrypt the new text. */
export async function editMessage(roomId: string, messageId: string, newText: string, myUid: string): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) {
    return;
  }
  const textFields = await buildEncryptedFieldGroup(roomId, myUid, trimmed);
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { ...textFields, editedAt: serverTimestamp() });
}

export async function deleteMessage(roomId: string, messageId: string, myUid: string): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { deletedFor: arrayUnion(myUid) });
}

function roomDocRef(roomId: string) {
  return doc(db, ROOMS_COLLECTION, roomId);
}

export function subscribeToPinnedMessageId(roomId: string, onPinnedId: (messageId: string | null) => void): Unsubscribe {
  return onSnapshot(
    roomDocRef(roomId),
    snap => {
      const data = snap.data();
      onPinnedId(typeof data?.pinnedMessageId === 'string' ? data.pinnedMessageId : null);
    },
    () => onPinnedId(null),
  );
}

export async function pinMessage(roomId: string, messageId: string): Promise<void> {
  await setDoc(roomDocRef(roomId), { pinnedMessageId: messageId }, { merge: true });
}

export async function unpinMessage(roomId: string): Promise<void> {
  await setDoc(roomDocRef(roomId), { pinnedMessageId: deleteField() }, { merge: true });
}

export async function fetchMessageById(roomId: string, messageId: string, myUid: string): Promise<ChatMessage | null> {
  const snap = await getDoc(doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId));
  if (!snap.exists()) {
    return null;
  }
  const ctx = await buildDecryptContext(roomId, myUid);
  return docToMessage(snap, ctx);
}

/** One-off (non-live) text search over a room's message history — see the mobile chatService.ts for the full rationale (no Firestore full-text search, client-side substring match over up to MAX_MESSAGE_LIMIT messages, deleted-for-me excluded). Used by both in-chat search and cross-contact global search. */
export async function searchMessagesInRoom(roomId: string, myUid: string, queryText: string): Promise<ChatMessage[]> {
  const needle = queryText.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const [snapshot, ctx] = await Promise.all([
    getDocs(query(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), orderBy('createdAt', 'desc'), limit(MAX_MESSAGE_LIMIT))),
    buildDecryptContext(roomId, myUid),
  ]);
  return snapshot.docs
    .map(d => docToMessage(d, ctx))
    .filter(message => !message.deletedFor?.includes(myUid) && message.type === 'text' && message.text.toLowerCase().includes(needle));
}
