import {
  addDoc,
  collection,
  deleteField,
  doc,
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

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'call';
export type CallLogStatus = 'completed' | 'missed';

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
 */
export function subscribeToMessages(
  roomId: string,
  limitCount: number,
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
      onMessages(snapshot.docs.map(docToMessage).reverse());
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
  return {
    id: docSnap.id,
    type: (data.type as MessageType) || 'text',
    text: typeof data.text === 'string' ? data.text : '',
    senderId: typeof data.senderId === 'string' ? data.senderId : '',
    createdAt,
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
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
  };
}

/**
 * Lightweight single-document listener (vs. subscribeToMessages' full
 * 300-message history) used by NotificationCenter to watch many rooms at
 * once without pulling each room's whole history just to spot new arrivals.
 */
export function subscribeToLatestMessage(
  roomId: string,
  onMessage: (message: ChatMessage | null) => void,
): Unsubscribe {
  const latestQuery = query(
    collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION),
    orderBy('createdAt', 'desc'),
    limit(1),
  );
  return onSnapshot(
    latestQuery,
    snapshot => {
      const docSnap = snapshot.docs[0];
      onMessage(docSnap ? docToMessage(docSnap) : null);
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

export async function sendMessage(roomId: string, text: string, senderId: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type: 'text',
    text: trimmed,
    senderId,
    createdAt: serverTimestamp(),
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

/** Sends an already-uploaded image/video/audio message (see mediaService.ts for the upload step). */
export async function sendMediaMessage(
  roomId: string,
  senderId: string,
  type: Exclude<MessageType, 'text'>,
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
