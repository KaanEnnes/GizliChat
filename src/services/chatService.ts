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

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: number;
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
      const messages = snapshot.docs.map((docSnap): ChatMessage => {
        const data = docSnap.data();
        const createdAt =
          data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();
        return {
          id: docSnap.id,
          text: typeof data.text === 'string' ? data.text : '',
          senderId: typeof data.senderId === 'string' ? data.senderId : '',
          createdAt,
        };
      });
      onMessages(messages);
    },
    error => onError(error as Error),
  );
}

export async function sendMessage(roomId: string, text: string, senderId: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  await addDoc(collection(db, ROOMS_COLLECTION, roomId, MESSAGES_SUBCOLLECTION), {
    text: trimmed,
    senderId,
    createdAt: serverTimestamp(),
  });
}
