import { collection, doc, onSnapshot, setDoc, type Unsubscribe, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface Contact {
  uid: string;
  name: string;
  addedAt: number;
  favorite: boolean;
}

/** Same one-directional contact model as the mobile app: stored at users/{myUid}/contacts/{contactUid}. */
export async function addContact(myUid: string, contactUid: string, name: string): Promise<void> {
  await setDoc(doc(db, 'users', myUid, 'contacts', contactUid), {
    name,
    addedAt: Date.now(),
    favorite: false,
  });
}

export async function setContactFavorite(myUid: string, contactUid: string, favorite: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', myUid, 'contacts', contactUid), { favorite });
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
