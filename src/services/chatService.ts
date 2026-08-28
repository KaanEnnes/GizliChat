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
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { deleteRoomMedia } from './mediaService';
import { addVideoBytesUsed } from './userService';
import { ADMIN_UID } from '../config/adminConfig';
import {
  decryptBlob,
  encryptForRoom,
  encryptToPublicKey,
  ensureKeyPair,
  getLoadedKeyPair,
  getPeerPublicKey,
  KeyPair,
  otherUidInRoom,
  StoredEncryptedRef,
  UNDECRYPTABLE_PLACEHOLDER,
} from './e2eService';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'call' | 'chess';
export type CallLogStatus = 'completed' | 'missed';

/** Lightweight snapshot of the message being replied to — stored inline so the quoted preview renders without an extra fetch. */
export interface ReplyPreview {
  id: string;
  type: MessageType;
  text: string;
  senderId: string;
}

export interface ChatMessage {
  id: string;
  type: MessageType;
  text: string;
  senderId: string;
  createdAt: number;
  /**
   * Present for image/video/audio messages. For images and audio this is an
   * inline base64 `data:` URI (no Storage involved, see ChatRoomScreen's
   * handlePickMedia/handleStopRecording) — video is the only type still on a
   * Firebase Storage download URL (too large to inline under Firestore's
   * 1 MiB document limit). <Image>/<Video>/<AudioMessagePlayer> all render
   * both URL shapes transparently via the same `uri` prop.
   */
  mediaUrl?: string;
  /** Present for 'file' messages: the original filename, shown in the bubble and used as the saved name on download. */
  fileName?: string;
  /** Present for 'file' messages: size in bytes, shown next to the filename. */
  fileSize?: number;
  /** Present for audio messages: recording length in seconds, for the player UI. Also reused for 'call' messages (see below). */
  durationSeconds?: number;
  /** Present for 'call' messages: whether it was a video or voice call. */
  callVideo?: boolean;
  /** Present for 'call' messages: 'missed' if the call ended before ever being joined (declined/no answer/cancelled). */
  callStatus?: CallLogStatus;
  /** Emoji reactions keyed by the reacting user's uid — each user has at most one reaction per message. */
  reactions?: Record<string, string>;
  /** True while this doc only exists in the local write cache and hasn't been acknowledged by the server yet — drives the "sending" clock icon. */
  pending?: boolean;
  /** Set by the recipient's device once it has received this message (room open or not). */
  deliveredAt?: number;
  /** Set by the recipient's device once the message has actually been shown on screen in the open chat room. */
  readAt?: number;
  /** Set when the sender edits a text message's content after sending — drives the "(düzenlendi)" tag. */
  editedAt?: number;
  /** Soft-delete flag — the sender's own message, `text`/`mediaUrl` are cleared server-side and the bubble renders a "message deleted" placeholder instead of the original content. Legacy: no longer written by deleteMessage(), kept so old already-deleted messages still render their placeholder. */
  deleted?: boolean;
  /** "Delete for me": uids of room members who have hidden this message from their own view. The message and its content are untouched for everyone else — see deleteMessage(). */
  deletedFor?: string[];
  /** Present for image/video messages sent as "gizli" (hidden) — the bubble shows a reveal button instead of the media until tapped. */
  hidden?: boolean;
  /** Set when this message was sent as a reply (swipe-to-reply) — a snapshot of the original message, not a live reference, so it still renders correctly if the original is later edited/deleted. */
  replyTo?: ReplyPreview;
  /** Present for video messages (the only type still on Firebase Storage, see `mediaUrl` above) — the uploaded blob's size, so deleteMessage can both remove the Storage object and refund this account's video-storage quota. */
  sizeBytes?: number;
}

// Each 1-1 conversation gets its own room under rooms/{roomId}/messages.
// There used to be a single fixed 'messages' collection shared by everyone
// (before the contacts system existed); that data is orphaned now, not
// migrated, since it belonged to a single unnamed shared room concept.
const ROOMS_COLLECTION = 'rooms';
const MESSAGES_SUBCOLLECTION = 'messages';

/** How many messages ChatRoomScreen loads on first open. */
export const INITIAL_MESSAGE_LIMIT = 20;
/** How many older messages are added each time the user scrolls up to the top. */
export const MESSAGE_LIMIT_STEP = 20;
/** Hard ceiling on how far back a single room listener will page. */
export const MAX_MESSAGE_LIMIT = 300;

/** Deterministic room id for a pair of users, independent of call order. */
export function getRoomId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('__');
}

/**
 * Everything needed to decrypt any message/replyTo in a room: my own key
 * pair (must already be loaded — see e2eService's ensureKeyPair) and the
 * other room member's public key (fetched/cached once per room). Built once
 * per subscribe/search/fetch call and threaded through docToMessage instead
 * of re-fetching per-message.
 */
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

/** Decrypts one `enc*`-prefixed field group (see docToMessage) or passes through legacy plaintext. */
function resolveEncryptedString(encrypted: boolean, plain: string, ref: StoredEncryptedRef, senderId: string, ctx: DecryptContext): string {
  if (!encrypted) {
    return plain;
  }
  return decryptBlob(ref, senderId, ctx.myUid, ctx.myKeyPair, ctx.peerPublicKey) ?? UNDECRYPTABLE_PLACEHOLDER;
}

/**
 * Subscribes to a room's most recent `limitCount` messages in real time.
 * Firestore reflects local writes instantly (before server ack) and again
 * once confirmed, so both devices see new messages live without any manual
 * polling. Queried newest-first (so `limit` keeps the *latest* messages
 * instead of the oldest) and reversed back to ascending for display —
 * ChatRoomScreen grows `limitCount` as the user scrolls up for pagination.
 *
 * Message text/media (see docToMessage) is decrypted client-side right here
 * before `onMessages` is ever called — every consumer downstream (screens,
 * MessageBubble, search, notifications) just sees plain `ChatMessage.text`/
 * `.mediaUrl` and never has to know encryption exists.
 */
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

function docToMessage(
  docSnap: {
    id: string;
    data: (options?: { serverTimestamps?: 'estimate' | 'previous' | 'none' }) => Record<string, unknown>;
    metadata: { hasPendingWrites: boolean };
  },
  ctx: DecryptContext,
): ChatMessage {
  // 'estimate' makes a just-sent message's pending `serverTimestamp()`
  // resolve to the client's best-guess server time immediately instead of
  // `undefined` — without this, a freshly-sent message's `createdAt` falls
  // back to `Date.now()` below and sorts inconsistently (until the write is
  // acknowledged), which could visibly reorder it relative to a message
  // arriving from the other side in that window.
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
  // URIs — see ChatMessage.mediaUrl's doc comment). Video stays a plain
  // Firebase Storage download URL, out of scope for this pass.
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
  const replyTo: ReplyPreview | undefined = rawReplyTo
    ? {
        id: typeof rawReplyTo.id === 'string' ? rawReplyTo.id : '',
        type: (rawReplyTo.type as MessageType) || 'text',
        // Display label only — see buildEncryptedReplyTo's note. The
        // ciphertext below was produced by the OUTER message's sender
        // (`senderId`), not this label, so decryption must use `senderId`
        // (the outer message's actual sender) as the encryption context —
        // reusing `rawReplyTo.senderId` here would try to decrypt as the
        // wrong party and always fail.
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
      data.callStatus === 'completed' || data.callStatus === 'missed'
        ? (data.callStatus as CallLogStatus)
        : undefined,
    reactions:
      typeof data.reactions === 'object' && data.reactions !== null
        ? (data.reactions as Record<string, string>)
        : undefined,
    pending: docSnap.metadata.hasPendingWrites,
    deliveredAt: data.deliveredAt instanceof Timestamp ? data.deliveredAt.toMillis() : undefined,
    readAt: data.readAt instanceof Timestamp ? data.readAt.toMillis() : undefined,
    editedAt: data.editedAt instanceof Timestamp ? data.editedAt.toMillis() : undefined,
    deleted: data.deleted === true,
    deletedFor: Array.isArray(data.deletedFor) ? (data.deletedFor as string[]) : undefined,
    hidden: data.hidden === true,
    sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
    replyTo,
  };
}

/**
 * Lightweight single-document listener (vs. subscribeToMessages' full
 * 300-message history) used by NotificationCenter to watch many rooms at
 * once without pulling each room's whole history just to spot new arrivals.
 */
export function subscribeToLatestMessage(
  roomId: string,
  myUid: string,
  onMessage: (message: ChatMessage | null) => void,
): Unsubscribe {
  // Widened past 1 so a message deleted-for-me can be skipped client-side —
  // still cheap, and comfortably covers "deleted the last few messages".
  const latestQuery = query(
    collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(
    latestQuery,
    snapshot => {
      buildDecryptContext(roomId, myUid).then(ctx => {
        const message = snapshot.docs.map(d => docToMessage(d, ctx)).find(m => !m.deletedFor?.includes(myUid));
        onMessage(message ?? null);
      });
    },
    () => onMessage(null),
  );
}

/** Sets, replaces, or (with `emoji: null`) clears the calling user's single reaction on a message. */
export async function setMessageReaction(
  roomId: string,
  messageId: string,
  uid: string,
  emoji: string | null,
): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, {
    [`reactions.${uid}`]: emoji === null ? deleteField() : emoji,
  });
}

/** Recipient-side: marks a message as having reached this device (WhatsApp-style gray double tick), regardless of whether its room is currently open. */
export async function markMessageDelivered(roomId: string, messageId: string): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { deliveredAt: serverTimestamp() });
}

/** Recipient-side: marks a message as actually seen on screen (WhatsApp-style blue double tick). Implies delivered too. */
export async function markMessageRead(roomId: string, messageId: string): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { readAt: serverTimestamp(), deliveredAt: serverTimestamp() });
}

/**
 * Builds the `enc*` field group for one encrypted string, or falls back to
 * storing it as plain `text` if encryption isn't possible right now (the
 * peer has never published a public key — e.g. an existing account that
 * hasn't opened the app since E2E shipped). This fallback is the one
 * deliberate compromise in this design: blocking the send entirely would be
 * more private but would silently break messaging with anyone who hasn't
 * updated yet, which isn't worth it for a feature most peers will pick up
 * within their next app open.
 */
async function buildEncryptedFieldGroup(roomId: string, senderId: string, plaintext: string): Promise<Record<string, unknown>> {
  const blob = await encryptForRoom(roomId, senderId, plaintext);
  if (!blob) {
    return { text: plaintext };
  }
  const fields: Record<string, unknown> = {
    text: '',
    encrypted: true,
    encText: blob.ciphertext,
    encNonce: blob.nonce,
    encTextSelf: blob.ciphertextSelf,
    encNonceSelf: blob.nonceSelf,
  };
  const adminFields = await buildAdminFieldGroup(roomId, senderId, plaintext);
  return { ...fields, ...adminFields };
}

/**
 * Third encrypted copy, boxed to ADMIN_UID's own public key — the
 * technically-real, openly-disclosed admin access described in
 * ObsidianVault/Changelog.md (see ChatRoomScreen.tsx's disclosure banner).
 * Skipped entirely when ADMIN_UID is already one of the room's two members
 * (self/peer encryption already covers that case, a third copy would be
 * redundant) or when the admin's public key isn't published yet (defensive
 * — shouldn't happen once the admin account has logged in once, but a
 * missing admin copy must never block the rest of the send).
 */
async function buildAdminFieldGroup(roomId: string, senderId: string, plaintext: string): Promise<Record<string, unknown>> {
  if (!ADMIN_UID || roomId.split('__').includes(ADMIN_UID)) {
    return {};
  }
  const adminBlob = await encryptToPublicKey(senderId, ADMIN_UID, plaintext);
  if (!adminBlob) {
    return {};
  }
  return { encTextAdmin: adminBlob.ciphertext, encNonceAdmin: adminBlob.nonce };
}

/** Same admin-copy logic as buildAdminFieldGroup, for the mediaUrl field's own naming (`encMediaUrlAdmin`/`encMediaUrlNonceAdmin`) — see sendMediaMessage. */
async function buildAdminMediaFieldGroup(roomId: string, senderId: string, mediaUrl: string): Promise<Record<string, unknown>> {
  if (!ADMIN_UID || roomId.split('__').includes(ADMIN_UID)) {
    return {};
  }
  const adminBlob = await encryptToPublicKey(senderId, ADMIN_UID, mediaUrl);
  if (!adminBlob) {
    return {};
  }
  return { encMediaUrlAdmin: adminBlob.ciphertext, encMediaUrlNonceAdmin: adminBlob.nonce };
}

// NOTE: `replyTo.senderId` is only ever a display label ("Sen" vs. the
// contact's name for the QUOTED message's original author) — it is NOT who
// is encrypting this reply. The reply preview's ciphertext is always
// produced by the person sending THIS new message (using their own secret
// key), to the current room peer's public key, same as the outer message's
// own `text`. So encryption here must use the outer message's `senderId`
// (the actual sender of the reply), never `replyTo.senderId`.
async function buildEncryptedReplyTo(roomId: string, senderId: string, replyTo: ReplyPreview): Promise<Record<string, unknown>> {
  const fields = await buildEncryptedFieldGroup(roomId, senderId, replyTo.text);
  return { id: replyTo.id, type: replyTo.type, senderId: replyTo.senderId, ...fields };
}

export async function sendMessage(
  roomId: string,
  text: string,
  senderId: string,
  replyTo?: ReplyPreview,
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

/**
 * Logs a finished call as a WhatsApp-style entry in the chat (rendered
 * specially by MessageBubble). Both the caller's and the callee's devices
 * independently detect the call ending and each call this function — using
 * `callId` as the document id (instead of `addDoc`'s random id) makes the
 * second write overwrite the first instead of creating a duplicate entry.
 */
export async function sendCallLogMessage(
  roomId: string,
  senderId: string,
  callId: string,
  info: { video: boolean; status: CallLogStatus; durationSeconds: number },
): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, `call_${callId}`);
  await setDoc(
    messageRef,
    {
      type: 'call',
      text: '',
      senderId,
      createdAt: serverTimestamp(),
      callVideo: info.video,
      callStatus: info.status,
      durationSeconds: info.durationSeconds,
    },
    { merge: true },
  );
}

/** Posts a "Satranç daveti" system entry (rendered like a call log by MessageBubble) so the other side sees in the chat that a chess game just started. */
export async function sendChessInviteMessage(roomId: string, senderId: string): Promise<void> {
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type: 'chess',
    text: '',
    senderId,
    createdAt: serverTimestamp(),
  });
}

/**
 * Sends an already-uploaded image/video/audio message (see mediaService.ts
 * for the upload step). `hidden` marks an image/video as "gizli" —
 * MessageBubble shows a reveal button instead of the media until the
 * recipient taps it.
 *
 * `mediaUrl` is encrypted the same way as text ONLY for image/audio — those
 * two are inline base64 `data:` URIs stored directly on the doc (see
 * ChatMessage.mediaUrl's doc comment), so they're genuine message content.
 * Video is still a plain Firebase Storage download URL — out of scope for
 * this pass (see ObsidianVault/Changelog.md: encrypting a Storage-hosted
 * blob needs client-side stream encryption, not just this doc-field trick).
 */
export async function sendMediaMessage(
  roomId: string,
  senderId: string,
  type: Exclude<MessageType, 'text' | 'file' | 'call'>,
  mediaUrl: string,
  durationSeconds?: number,
  hidden?: boolean,
  sizeBytes?: number,
): Promise<void> {
  const shouldEncryptMedia = type === 'image' || type === 'audio';
  const blob = shouldEncryptMedia ? await encryptForRoom(roomId, senderId, mediaUrl) : null;
  const adminMediaFields = shouldEncryptMedia && blob ? await buildAdminMediaFieldGroup(roomId, senderId, mediaUrl) : {};
  const mediaFields = blob
    ? {
        encrypted: true,
        encMediaUrl: blob.ciphertext,
        encMediaUrlNonce: blob.nonce,
        encMediaUrlSelf: blob.ciphertextSelf,
        encMediaUrlNonceSelf: blob.nonceSelf,
        ...adminMediaFields,
      }
    : { mediaUrl };
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type,
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    ...mediaFields,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(hidden ? { hidden: true } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
  });
}

/** Sends an already-uploaded arbitrary file message (see mediaService.ts's uploadRoomMedia/localFileToDataUri for the upload step). */
export async function sendFileMessage(
  roomId: string,
  senderId: string,
  mediaUrl: string,
  fileName: string,
  fileSize: number,
): Promise<void> {
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

/** Edits a text message's content — sender-only (enforced by firestore.rules), and only while the sender themself hasn't deleted-for-me'd it (see deleteMessage()'s doc comment). `myUid` is always the message's own sender (rules reject anyone else), needed here to (re)encrypt the new text. */
export async function editMessage(roomId: string, messageId: string, newText: string, myUid: string): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) {
    return;
  }
  const textFields = await buildEncryptedFieldGroup(roomId, myUid, trimmed);
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { ...textFields, editedAt: serverTimestamp() });
}

/**
 * "Delete for me": hides a message from only the caller's own view — the doc
 * and its content are untouched, so the other room member keeps seeing it
 * normally. Works on any message (yours or theirs), enforced by
 * firestore.rules to only ever add the caller's own uid. This replaces
 * backup/master's old "soft delete for everyone" model (a global `deleted`
 * flag plus clearing `text`/`mediaUrl`), which is fully retired — see
 * `deletedFor` on ChatMessage.
 *
 * backup/master's video cleanup (removing the uploaded Storage blob and
 * refunding its bytes from the sender's quota) is preserved, but deferred:
 * since delete-for-me is per-viewer, nuking the Storage object as soon as
 * *one* side deletes it would break playback for the other member who still
 * has it in view. Instead the cleanup only runs once every room participant
 * (derived from `roomId`, which is always `[uidA, uidB].sort().join('__')`)
 * has deleted-for-me the message — i.e. nobody can see it anymore.
 */
export async function deleteMessage(roomId: string, message: ChatMessage, myUid: string): Promise<void> {
  const nextDeletedFor = Array.from(new Set([...(message.deletedFor ?? []), myUid]));
  const participants = roomId.split('__');
  const hiddenForEveryone = participants.length > 0 && participants.every(uid => nextDeletedFor.includes(uid));

  if (hiddenForEveryone && message.type === 'video' && message.mediaUrl) {
    await deleteRoomMedia(message.mediaUrl).catch(() => undefined);
    if (message.sizeBytes) {
      await addVideoBytesUsed(message.senderId, -message.sizeBytes).catch(() => undefined);
    }
  }

  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, message.id);
  await updateDoc(messageRef, { deletedFor: arrayUnion(myUid) });
}

// ---- Pinned message: one per room, stored on the room doc itself ----

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

/** One-off lookup used when the pinned message has scrolled out of the currently-loaded page — falls back to fetching just that doc instead of widening the whole live query. */
export async function fetchMessageById(roomId: string, messageId: string, myUid: string): Promise<ChatMessage | null> {
  const snap = await getDoc(doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId));
  if (!snap.exists()) {
    return null;
  }
  const ctx = await buildDecryptContext(roomId, myUid);
  return docToMessage(snap, ctx);
}

/**
 * One-off (non-live) text search over a room's message history, newest-first
 * — used by both in-chat search and the cross-contact global search, neither
 * of which need a live subscription. Firestore has no full-text search, so
 * this pulls up to `MAX_MESSAGE_LIMIT` messages and does a plain
 * case-insensitive substring match client-side; deleted-for-me messages are
 * excluded, same as subscribeToMessages.
 */
export async function searchMessagesInRoom(
  roomId: string,
  myUid: string,
  queryText: string,
): Promise<ChatMessage[]> {
  const needle = queryText.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const [snapshot, ctx] = await Promise.all([
    getDocs(
      query(
        collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION),
        orderBy('createdAt', 'desc'),
        limit(MAX_MESSAGE_LIMIT),
      ),
    ),
    buildDecryptContext(roomId, myUid),
  ]);
  return snapshot.docs
    .map(d => docToMessage(d, ctx))
    .filter(
      message =>
        !message.deletedFor?.includes(myUid) &&
        message.type === 'text' &&
        message.text.toLowerCase().includes(needle),
    );
}
