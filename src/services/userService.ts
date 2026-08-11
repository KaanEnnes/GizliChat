import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';

export interface UserProfile {
  uid: string;
  name: string;
  code: string;
}

// Ambiguous-looking characters (0/O, 1/I) are left out so a code is easy to
// read aloud or copy correctly.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Loads this device's chat identity (users/{uid}), creating it with a fresh
 * shareable code on first use. The uid comes from Firebase anonymous auth
 * (persisted via AsyncStorage), so the same profile/code is reused across
 * app restarts as long as the app isn't reinstalled.
 */
export async function ensureUserProfile(uid: string, defaultName: string): Promise<UserProfile> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    return {
      uid,
      name: typeof data.name === 'string' && data.name ? data.name : defaultName,
      code: typeof data.code === 'string' && data.code ? data.code : generateCode(),
    };
  }
  const code = generateCode();
  await setDoc(ref, { name: defaultName, code, createdAt: Date.now() });
  return { uid, name: defaultName, code };
}

export async function updateMyName(uid: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { name });
}

export async function findUserByCode(
  code: string,
): Promise<{ uid: string; name: string } | null> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return null;
  }
  const usersQuery = query(collection(db, 'users'), where('code', '==', cleanCode), limit(1));
  const snapshot = await getDocs(usersQuery);
  if (snapshot.empty) {
    return null;
  }
  const found = snapshot.docs[0];
  const data = found.data();
  return { uid: found.id, name: typeof data.name === 'string' ? data.name : 'Kullanıcı' };
}
