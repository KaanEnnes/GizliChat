import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from '@firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';

/** A contact is shown as "online" if their last heartbeat was within this window. */
export const ONLINE_THRESHOLD_MS = 60_000;

export interface Account {
  uid: string;
  username: string;
}

// Firebase Auth here is used purely as an email/password backend; there's no
// real email involved. A username is mapped to a synthetic address so a
// human just sees "username" + "password" while Firebase still gets the
// email/password shape it expects. This is what makes an account portable
// across devices/reinstalls (unlike the old per-install anonymous identity):
// logging in with the same username+password anywhere restores the same uid.
const USERNAME_EMAIL_DOMAIN = '@gizlichat.local';
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}${USERNAME_EMAIL_DOMAIN}`;
}

export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username.trim())) {
    return 'Kullanıcı adı 3-20 karakter olmalı, sadece harf/rakam/_ içerebilir.';
  }
  return null;
}

function mapAuthError(error: unknown): string {
  const code = (error as { code?: string }).code ?? '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Bu kullanıcı adı zaten alınmış.';
    case 'auth/weak-password':
      return 'Şifre en az 6 karakter olmalı.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Kullanıcı adı veya şifre hatalı.';
    case 'auth/invalid-email':
      return 'Geçersiz kullanıcı adı.';
    default:
      return (error as Error).message ?? 'Beklenmeyen bir hata oluştu.';
  }
}

export async function registerAccount(username: string, password: string): Promise<Account> {
  const cleanUsername = username.trim();
  const usernameError = validateUsername(cleanUsername);
  if (usernameError) {
    throw new Error(usernameError);
  }
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      usernameToEmail(cleanUsername),
      password,
    );
    await setDoc(doc(db, 'users', credential.user.uid), {
      username: cleanUsername,
      usernameLower: cleanUsername.toLowerCase(),
      createdAt: Date.now(),
    });
    return { uid: credential.user.uid, username: cleanUsername };
  } catch (error) {
    throw new Error(mapAuthError(error));
  }
}

export async function loginAccount(username: string, password: string): Promise<Account> {
  const cleanUsername = username.trim();
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      usernameToEmail(cleanUsername),
      password,
    );
    const snap = await getDoc(doc(db, 'users', credential.user.uid));
    const savedUsername =
      snap.exists() && typeof snap.data().username === 'string'
        ? (snap.data().username as string)
        : cleanUsername;
    return { uid: credential.user.uid, username: savedUsername };
  } catch (error) {
    throw new Error(mapAuthError(error));
  }
}

export async function logoutAccount(): Promise<void> {
  await signOut(auth);
}

/** Looks up a saved (non-anonymous) account's username for an already-signed-in uid. */
export async function fetchAccountUsername(uid: string): Promise<string | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) {
    return null;
  }
  const data = snap.data();
  return typeof data.username === 'string' ? data.username : null;
}

/**
 * Stamps this device's account as "recently active" — cheap presence, not a
 * real online/offline event system. Callers re-invoke this on an interval
 * while the app is authenticated and foregrounded (see AppNavigator); a
 * contact reads as online while their last stamp is within
 * `ONLINE_THRESHOLD_MS` (see `subscribeToPresence`).
 */
export async function updatePresenceHeartbeat(uid: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }, { merge: true });
}

/**
 * Watches another user's last heartbeat and reports it as a raw timestamp
 * (or null if they've never been active) — the caller decides staleness
 * against `ONLINE_THRESHOLD_MS` itself, since a Firestore listener only
 * re-fires on a new write, not merely because time has passed.
 */
export function subscribeToPresence(
  uid: string,
  onLastActiveAt: (lastActiveAt: number | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    snap => {
      const data = snap.data();
      const lastActiveAt = data?.lastActiveAt;
      onLastActiveAt(lastActiveAt instanceof Timestamp ? lastActiveAt.toMillis() : null);
    },
    () => onLastActiveAt(null),
  );
}

export async function findUserByUsername(username: string): Promise<Account | null> {
  const cleanUsername = username.trim().toLowerCase();
  if (!cleanUsername) {
    return null;
  }
  const usersQuery = query(
    collection(db, 'users'),
    where('usernameLower', '==', cleanUsername),
    limit(1),
  );
  const snapshot = await getDocs(usersQuery);
  if (snapshot.empty) {
    return null;
  }
  const found = snapshot.docs[0];
  const data = found.data();
  return {
    uid: found.id,
    username: typeof data.username === 'string' ? data.username : cleanUsername,
  };
}
