import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { FIREBASE_CONFIG } from '../config/firebaseConfig';

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// localStorage-based persistence avoids the IndexedDB flakiness that
// Auth's default persistence can hit on some browser setups, and still
// survives a page reload — same reasoning as the original pc-client.
setPersistence(auth, browserLocalPersistence).catch(() => undefined);

let authReadyPromise: Promise<User> | null = null;

/**
 * Ensures the browser has some Firebase identity (real account or anonymous),
 * signing in anonymously if needed — same purpose as the mobile app's
 * ensureAnonymousAuth: the standalone mini-games (played without ever
 * logging into chat) still need `request.auth != null` to write a
 * leaderboard score.
 */
export function ensureAnonymousAuth(): Promise<User> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }
  if (!authReadyPromise) {
    authReadyPromise = signInAnonymously(auth).then(credential => credential.user);
  }
  return authReadyPromise;
}
