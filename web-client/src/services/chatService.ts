import {
  addDoc,
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

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'call' | 'song';

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
  /** Present for 'song' messages — a YouTube video id plus the clip window the sender picked (see songService.ts / SongPickerModal). */
  youtubeVideoId?: string;
  songTitle?: string;
  songArtist?: string;
  songThumbnailUrl?: string;
  clipStartSeconds?: number;
  clipDurationSeconds?: number;
  reactions?: Record<string, string>;
  pending?: boolean;
  deliveredAt?: number;
  readAt?: number;
  editedAt?: number;
  /** Set once either room member deletes this message — hides it from BOTH participants' message list (see subscribeToMessages/subscribeToLatestMessage/searchMessagesInRoom's filtering and deleteMessage()). The doc and every other field (`text`/`mediaUrl`/etc.) are left fully intact in Firestore — nothing is cleared — so the data still exists for the admin panel to see (see AdminScreen.tsx, which deliberately does not apply this filter). */
  deleted?: boolean;
  /** Uid of whichever room member called deleteMessage() — set alongside `deleted`. */
  deletedBy?: string;
  /** When the message was deleted — set alongside `deleted`. */
  deletedAt?: number;
  replyTo?: {
    messageId: string;
    text: string;
    senderId: string;
    type: MessageType;
  };
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

function docToMessage(docSnap: {
  id: string;
  data: (options?: { serverTimestamps?: 'estimate' | 'previous' | 'none' }) => Record<string, unknown>;
  metadata: { hasPendingWrites: boolean };
}): ChatMessage {
  const data = docSnap.data({ serverTimestamps: 'estimate' });
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();
  const type = (data.type as MessageType) || 'text';
  const senderId = typeof data.senderId === 'string' ? data.senderId : '';
  const text = typeof data.text === 'string' ? data.text : '';
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined;

  const rawReplyTo = typeof data.replyTo === 'object' && data.replyTo !== null ? (data.replyTo as Record<string, unknown>) : undefined;
  const replyTo: ChatMessage['replyTo'] = rawReplyTo
    ? {
        messageId: typeof rawReplyTo.messageId === 'string' ? rawReplyTo.messageId : '',
        type: (rawReplyTo.type as MessageType) || 'text',
        senderId: typeof rawReplyTo.senderId === 'string' ? rawReplyTo.senderId : '',
        text: typeof rawReplyTo.text === 'string' ? rawReplyTo.text : '',
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
    deletedBy: typeof data.deletedBy === 'string' ? data.deletedBy : undefined,
    deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt.toMillis() : undefined,
    replyTo,
    youtubeVideoId: typeof data.youtubeVideoId === 'string' ? data.youtubeVideoId : undefined,
    songTitle: typeof data.songTitle === 'string' ? data.songTitle : undefined,
    songArtist: typeof data.songArtist === 'string' ? data.songArtist : undefined,
    songThumbnailUrl: typeof data.songThumbnailUrl === 'string' ? data.songThumbnailUrl : undefined,
    clipStartSeconds: typeof data.clipStartSeconds === 'number' ? data.clipStartSeconds : undefined,
    clipDurationSeconds: typeof data.clipDurationSeconds === 'number' ? data.clipDurationSeconds : undefined,
  };
}

/**
 * Subscribes to a room's most recent `limitCount` messages in real time.
 *
 * `includeDeleted` (default false) skips the "hide deleted messages" filter
 * — used only by the admin panel (AdminScreen.tsx), which is deliberately
 * allowed to keep seeing a message either room member has deleted, since the
 * whole point of the shared `deleted` flag (see ChatMessage.deleted) is that
 * the underlying data stays intact in Firestore for exactly this kind of
 * visibility. The two regular clients always use the default (false).
 */
export function subscribeToMessages(
  roomId: string,
  limitCount: number,
  myUid: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
  includeDeleted = false,
): Unsubscribe {
  const messagesQuery = query(
    collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION),
    orderBy('createdAt', 'desc'),
    limit(limitCount),
  );
  return onSnapshot(
    messagesQuery,
    snapshot => {
      onMessages(
        snapshot.docs
          .map(d => docToMessage(d))
          .filter(message => includeDeleted || !message.deleted)
          .reverse(),
      );
    },
    error => onError(error as Error),
  );
}

export function subscribeToLatestMessage(roomId: string, myUid: string, onMessage: (message: ChatMessage | null) => void): Unsubscribe {
  // Widened past 1 so a deleted message can be skipped client-side.
  const latestQuery = query(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), orderBy('createdAt', 'desc'), limit(20));
  return onSnapshot(
    latestQuery,
    snapshot => {
      const found = snapshot.docs.map(d => docToMessage(d)).find(message => !message.deleted);
      onMessage(found ?? null);
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
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type: 'text',
    text: trimmed,
    senderId,
    createdAt: serverTimestamp(),
    ...(replyTo ? { replyTo } : {}),
  });
}

export async function sendMediaMessage(
  roomId: string,
  senderId: string,
  type: Exclude<MessageType, 'text' | 'file' | 'call'>,
  mediaUrl: string,
  durationSeconds?: number,
): Promise<void> {
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type,
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    mediaUrl,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  });
}

export interface SongClip {
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  startSeconds: number;
  durationSeconds: number;
}

export async function sendSongMessage(roomId: string, senderId: string, song: SongClip): Promise<void> {
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type: 'song',
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    youtubeVideoId: song.videoId,
    songTitle: song.title,
    songArtist: song.artist,
    songThumbnailUrl: song.thumbnailUrl,
    clipStartSeconds: song.startSeconds,
    clipDurationSeconds: song.durationSeconds,
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

/** `myUid` is always the message's own sender (firestore.rules rejects anyone else editing). */
export async function editMessage(roomId: string, messageId: string, newText: string, myUid: string): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) {
    return;
  }
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { text: trimmed, editedAt: serverTimestamp() });
}

/**
 * Hides a message from BOTH room members at once — whichever one deletes it,
 * the other stops seeing it too (see the `!message.deleted` filters in
 * subscribeToMessages/subscribeToLatestMessage/searchMessagesInRoom).
 * Deliberately does NOT clear `text`/`mediaUrl`/any other field: the content
 * stays fully intact in Firestore, just hidden from the two participants'
 * own views — the admin panel (AdminScreen.tsx) intentionally does not apply
 * this filter, so the data remains visible there. Enforced by
 * firestore.rules to only ever set exactly `deleted`/`deletedBy`/`deletedAt`,
 * and only by a room member.
 */
export async function deleteMessage(roomId: string, messageId: string, myUid: string): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { deleted: true, deletedBy: myUid, deletedAt: serverTimestamp() });
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

/** How stale a `typing` timestamp can be before the reader should treat it as "no longer typing" — covers the case where the typer's tab closes/crashes without ever writing the `false`/deleteField() clear. */
export const TYPING_TIMEOUT_MS = 4000;

/** Stamps (or clears) this room's shared "who's typing" pointer for `uid`, keyed by uid so both members can have independent state on the same room doc — same relaxed, room-member-write model as `pinnedMessageId`. */
export async function setTypingStatus(roomId: string, uid: string, isTyping: boolean): Promise<void> {
  await setDoc(roomDocRef(roomId), { typing: { [uid]: isTyping ? serverTimestamp() : deleteField() } }, { merge: true });
}

/** Live timestamp (ms) of `otherUid`'s last typing stamp in this room, or null if they've never typed / it was cleared. The caller decides staleness against TYPING_TIMEOUT_MS on its own timer, since Firestore only pushes on writes, not on the clock ticking. */
export function subscribeToTypingTimestamp(roomId: string, otherUid: string, onTimestamp: (timestampMs: number | null) => void): Unsubscribe {
  return onSnapshot(
    roomDocRef(roomId),
    snap => {
      const raw = (snap.data()?.typing as Record<string, unknown> | undefined)?.[otherUid];
      onTimestamp(raw instanceof Timestamp ? raw.toMillis() : null);
    },
    () => onTimestamp(null),
  );
}

export async function fetchMessageById(roomId: string, messageId: string, myUid: string): Promise<ChatMessage | null> {
  const snap = await getDoc(doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId));
  if (!snap.exists()) {
    return null;
  }
  return docToMessage(snap);
}

/** One-off (non-live) text search over a room's message history — see the mobile chatService.ts for the full rationale (no Firestore full-text search, client-side substring match over up to MAX_MESSAGE_LIMIT messages, deleted messages excluded). Used by both in-chat search and cross-contact global search. */
export async function searchMessagesInRoom(roomId: string, myUid: string, queryText: string): Promise<ChatMessage[]> {
  const needle = queryText.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const snapshot = await getDocs(
    query(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), orderBy('createdAt', 'desc'), limit(MAX_MESSAGE_LIMIT)),
  );
  return snapshot.docs
    .map(d => docToMessage(d))
    .filter(message => !message.deleted && message.type === 'text' && message.text.toLowerCase().includes(needle));
}
