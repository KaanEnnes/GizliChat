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
  return {
    id: docSnap.id,
    type: (data.type as MessageType) || 'text',
    text: typeof data.text === 'string' ? data.text : '',
    senderId: typeof data.senderId === 'string' ? data.senderId : '',
    createdAt,
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
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
    replyTo: typeof data.replyTo === 'object' && data.replyTo !== null ? (data.replyTo as ChatMessage['replyTo']) : undefined,
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
    snapshot =>
      onMessages(
        snapshot.docs
          .map(docToMessage)
          .filter(message => !message.deletedFor?.includes(myUid))
          .reverse(),
      ),
    error => onError(error as Error),
  );
}

export function subscribeToLatestMessage(roomId: string, myUid: string, onMessage: (message: ChatMessage | null) => void): Unsubscribe {
  // Widened past 1 so a message deleted-for-me can be skipped client-side.
  const latestQuery = query(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), orderBy('createdAt', 'desc'), limit(20));
  return onSnapshot(
    latestQuery,
    snapshot => {
      const found = snapshot.docs.map(docToMessage).find(message => !message.deletedFor?.includes(myUid));
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

export async function editMessage(roomId: string, messageId: string, newText: string): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) {
    return;
  }
  const messageRef = doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId);
  await updateDoc(messageRef, { text: trimmed, editedAt: serverTimestamp() });
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

export async function fetchMessageById(roomId: string, messageId: string): Promise<ChatMessage | null> {
  const snap = await getDoc(doc(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION, messageId));
  return snap.exists() ? docToMessage(snap) : null;
}

/** One-off (non-live) text search over a room's message history — see the mobile chatService.ts for the full rationale (no Firestore full-text search, client-side substring match over up to MAX_MESSAGE_LIMIT messages, deleted-for-me excluded). Used by both in-chat search and cross-contact global search. */
export async function searchMessagesInRoom(roomId: string, myUid: string, queryText: string): Promise<ChatMessage[]> {
  const needle = queryText.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  const snapshot = await getDocs(
    query(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), orderBy('createdAt', 'desc'), limit(MAX_MESSAGE_LIMIT)),
  );
  return snapshot.docs
    .map(docToMessage)
    .filter(message => !message.deletedFor?.includes(myUid) && message.type === 'text' && message.text.toLowerCase().includes(needle));
}
