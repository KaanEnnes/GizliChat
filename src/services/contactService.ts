import { collection, doc, onSnapshot, setDoc, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';

export interface Contact {
  uid: string;
  name: string;
  addedAt: number;
}

/**
 * Adds (or overwrites) a contact in the current user's own contact list,
 * stored at users/{myUid}/contacts/{contactUid}. This is one-directional:
 * adding someone by their code doesn't add you to their list, they'd need
 * your code too for the reverse. Simple enough for a 1-1 chat MVP.
 */
export async function addContact(myUid: string, contactUid: string, name: string): Promise<void> {
  await setDoc(doc(db, 'users', myUid, 'contacts', contactUid), {
    name,
    addedAt: Date.now(),
  });
}

export function subscribeToContacts(
  myUid: string,
  onContacts: (contacts: Contact[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(db, 'users', myUid, 'contacts'),
    snapshot => {
      const contacts = snapshot.docs.map((docSnap): Contact => {
        const data = docSnap.data();
        return {
          uid: docSnap.id,
          name: typeof data.name === 'string' ? data.name : 'Kişi',
          addedAt: typeof data.addedAt === 'number' ? data.addedAt : 0,
        };
      });
      contacts.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      onContacts(contacts);
    },
    error => onError(error as Error),
  );
}
