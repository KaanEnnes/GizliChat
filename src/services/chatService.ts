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
  Unsubscribe,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'call' | 'chess' | 'song';
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
  /** Set once either room member deletes this message — hides it from BOTH participants' message list (see subscribeToMessages/subscribeToLatestMessage/searchMessagesInRoom's filtering and deleteMessage()). The doc and every other field (`text`/`mediaUrl`/etc.) are left fully intact in Firestore — nothing is cleared — so the data still exists for the admin panel to see (see AdminScreen.tsx, web-client only). */
  deleted?: boolean;
  /** Uid of whichever room member called deleteMessage() — set alongside `deleted`. */
  deletedBy?: string;
  /** When the message was deleted — set alongside `deleted`. */
  deletedAt?: number;
  /** Present for image/video messages sent as "gizli" (hidden) — the bubble shows a reveal button instead of the media until tapped. */
  hidden?: boolean;
  /** Set when this message was sent as a reply (swipe-to-reply) — a snapshot of the original message, not a live reference, so it still renders correctly if the original is later edited/deleted. */
  replyTo?: ReplyPreview;
  /** Present for video messages (the only type still on Firebase Storage, see `mediaUrl` above) — the uploaded blob's size, so deleteMessage can both remove the Storage object and refund this account's video-storage quota. */
  sizeBytes?: number;
  /** Present for 'song' messages — a YouTube video id plus the clip window the sender picked (see songService.ts / SongPickerModal). Same fields as the web client's copy. */
  youtubeVideoId?: string;
  songTitle?: string;
  songArtist?: string;
  songThumbnailUrl?: string;
  clipStartSeconds?: number;
  clipDurationSeconds?: number;
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
 * Subscribes to a room's most recent `limitCount` messages in real time.
 * Firestore reflects local writes instantly (before server ack) and again
 * once confirmed, so both devices see new messages live without any manual
 * polling. Queried newest-first (so `limit` keeps the *latest* messages
 * instead of the oldest) and reversed back to ascending for display —
 * ChatRoomScreen grows `limitCount` as the user scrolls up for pagination.
 *
 * A message either room member has deleted (`deleted: true`, see
 * deleteMessage()) is filtered out here for both participants — its content
 * stays intact in Firestore, it's just hidden from this list.
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
      onMessages(
        snapshot.docs
          .map(d => docToMessage(d))
          .filter(message => !message.deleted)
          .reverse(),
      );
    },
    error => onError(error as Error),
  );
}

function docToMessage(docSnap: {
  id: string;
  data: (options?: { serverTimestamps?: 'estimate' | 'previous' | 'none' }) => Record<string, unknown>;
  metadata: { hasPendingWrites: boolean };
}): ChatMessage {
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
  const text = typeof data.text === 'string' ? data.text : '';
  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined;

  const rawReplyTo = typeof data.replyTo === 'object' && data.replyTo !== null ? (data.replyTo as Record<string, unknown>) : undefined;
  const replyTo: ReplyPreview | undefined = rawReplyTo
    ? {
        id: typeof rawReplyTo.id === 'string' ? rawReplyTo.id : '',
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
    deletedBy: typeof data.deletedBy === 'string' ? data.deletedBy : undefined,
    deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt.toMillis() : undefined,
    hidden: data.hidden === true,
    sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
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
 * Lightweight single-document listener (vs. subscribeToMessages' full
 * 300-message history) used by NotificationCenter to watch many rooms at
 * once without pulling each room's whole history just to spot new arrivals.
 */
export function subscribeToLatestMessage(
  roomId: string,
  myUid: string,
  onMessage: (message: ChatMessage | null) => void,
): Unsubscribe {
  // Widened past 1 so a deleted message can be skipped client-side — still
  // cheap, and comfortably covers "deleted the last few messages".
  const latestQuery = query(
    collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(
    latestQuery,
    snapshot => {
      const message = snapshot.docs.map(d => docToMessage(d)).find(m => !m.deleted);
      onMessage(message ?? null);
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
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type: 'text',
    text: trimmed,
    senderId,
    createdAt: serverTimestamp(),
    ...(replyTo
      ? { replyTo: { id: replyTo.id, type: replyTo.type, senderId: replyTo.senderId, text: replyTo.text } }
      : {}),
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
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type,
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    mediaUrl,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(hidden ? { hidden: true } : {}),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
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

/** Edits a text message's content — sender-only (enforced by firestore.rules), and only while it hasn't been deleted (see deleteMessage()'s doc comment). `myUid` is always the message's own sender (rules reject anyone else). */
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
 * Deliberately does NOT clear `text`/`mediaUrl`/any other field: the message
 * content stays fully intact in Firestore so it isn't actually destroyed,
 * just hidden from the two participants' own views — the admin panel
 * (web-client's AdminScreen.tsx) intentionally does not apply this filter,
 * so the data remains visible there. No Storage cleanup happens here either
 * (a deleted video's file is left in place, for the same "keep the data"
 * reason) — enforced by firestore.rules to only ever set exactly `deleted`/
 * `deletedBy`/`deletedAt`, and only by a room member.
 */
export async function deleteMessage(roomId: string, message: ChatMessage, myUid: string): Promise<void> {
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, message.id);
  await updateDoc(messageRef, { deleted: true, deletedBy: myUid, deletedAt: serverTimestamp() });
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

// ---- Typing indicator: shared per-room map, one timestamp per uid ----

/** How stale a `typing` timestamp can be before the reader should treat it as "no longer typing" — covers the case where the typer's app closes/crashes without ever writing the `false`/deleteField() clear. Same value as the web client's chatService.ts. */
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

/** One-off lookup used when the pinned message has scrolled out of the currently-loaded page — falls back to fetching just that doc instead of widening the whole live query. */
export async function fetchMessageById(roomId: string, messageId: string, myUid: string): Promise<ChatMessage | null> {
  const snap = await getDoc(doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId));
  if (!snap.exists()) {
    return null;
  }
  return docToMessage(snap);
}

/**
 * One-off (non-live) text search over a room's message history, newest-first
 * — used by both in-chat search and the cross-contact global search, neither
 * of which need a live subscription. Firestore has no full-text search, so
 * this pulls up to `MAX_MESSAGE_LIMIT` messages and does a plain
 * case-insensitive substring match client-side; deleted messages are
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
  const snapshot = await getDocs(
    query(
      collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION),
      orderBy('createdAt', 'desc'),
      limit(MAX_MESSAGE_LIMIT),
    ),
  );
  return snapshot.docs
    .map(d => docToMessage(d))
    .filter(message => !message.deleted && message.type === 'text' && message.text.toLowerCase().includes(needle));
}
