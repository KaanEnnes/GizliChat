import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, getAuth, setPersistence, signInAnonymously, type User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { FIREBASE_CONFIG } from '../config/firebaseConfig';

export const app = initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Deferred instead of an eager `getFunctions(app)` at module-eval time — in
// this Vite dev setup the 'functions' component can lose the race with
// initializeApp() during the very first page load (throws "Service functions
// is not available" even though `firebase/functions` was imported), but
// resolves fine by the time anything actually calls this after the module
// graph has settled (e.g. on first song search).
let _functions: Functions | null = null;
export function getFunctionsInstance(): Functions {
  if (!_functions) {
    _functions = getFunctions(app);
  }
  return _functions;
}

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
