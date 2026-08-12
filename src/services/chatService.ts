import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  Unsubscribe,
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
}

// Each 1-1 conversation gets its own room under rooms/{roomId}/messages.
// There used to be a single fixed 'messages' collection shared by everyone
// (before the contacts system existed); that data is orphaned now, not
// migrated, since it belonged to a single unnamed shared room concept.
const ROOMS_COLLECTION = 'rooms';
const MESSAGES_SUBCOLLECTION = 'messages';
const MESSAGE_LIMIT = 300;

/** Deterministic room id for a pair of users, independent of call order. */
export function getRoomId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('__');
}

/**
 * Subscribes to a room's message history in real time. Firestore reflects
 * local writes instantly (before server ack) and again once confirmed, so
 * both devices see new messages live without any manual polling.
 */
export function subscribeToMessages(
  roomId: string,
  onMessages: (messages: ChatMessage[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const messagesQuery = query(
    collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION),
    orderBy('createdAt', 'asc'),
    limit(MESSAGE_LIMIT),
  );

  return onSnapshot(
    messagesQuery,
    snapshot => {
      onMessages(snapshot.docs.map(docToMessage));
    },
    error => onError(error as Error),
  );
}

function docToMessage(docSnap: { id: string; data: () => Record<string, unknown> }): ChatMessage {
  const data = docSnap.data();
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

/** Logs a finished call as a WhatsApp-style entry in the chat (rendered specially by MessageBubble). */
export async function sendCallLogMessage(
  roomId: string,
  senderId: string,
  info: { video: boolean; status: CallLogStatus; durationSeconds: number },
): Promise<void> {
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    type: 'call',
    text: '',
    senderId,
    createdAt: serverTimestamp(),
    callVideo: info.video,
    callStatus: info.status,
    durationSeconds: info.durationSeconds,
  });
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
