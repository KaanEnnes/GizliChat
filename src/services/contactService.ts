import { collection, deleteDoc, doc, onSnapshot, setDoc, Unsubscribe, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface Contact {
  uid: string;
  name: string;
  addedAt: number;
  favorite: boolean;
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
    favorite: false,
  });
}

/** Toggles whether a contact is pinned to the home dashboard's "Favoriler" row. */
export async function setContactFavorite(myUid: string, contactUid: string, favorite: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', myUid, 'contacts', contactUid), { favorite });
}

/** Removes the chat from this user's list only — the other side's contact doc and the shared room are untouched. */
export async function removeContact(myUid: string, contactUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', myUid, 'contacts', contactUid));
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
          favorite: data.favorite === true,
        };
      });
      contacts.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      onContacts(contacts);
    },
    error => onError(error as Error),
  );
}
