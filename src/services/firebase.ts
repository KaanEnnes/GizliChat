import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp } from 'firebase/app';
// Imported from the scoped @firebase/auth package (not the "firebase" convenience
// wrapper): only @firebase/auth's package.json declares a "react-native" export
// condition, which is what makes Metro resolve a build with persistent
// (AsyncStorage-backed) auth sessions instead of the browser/node build.
import * as FirebaseAuth from '@firebase/auth';
import { initializeAuth, onAuthStateChanged, Persistence, signInAnonymously, User } from '@firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getFunctions, type Functions } from 'firebase/functions';
import { FIREBASE_CONFIG } from '../config/firebaseConfig';

// getReactNativePersistence is exported by @firebase/auth's "react-native"
// build at runtime, but its .d.ts isn't picked up by TypeScript's package
// exports resolution here (the package's top-level "types" entry — which
// TS matches before any conditional branch — points at the default/browser
// declarations, which omit it). This cast bridges that types-only gap.
const getReactNativePersistence = (
  FirebaseAuth as unknown as {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  }
).getReactNativePersistence;

export const app = initializeApp(FIREBASE_CONFIG);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Auto-detects whether gRPC streaming works and only falls back to long
// polling when it doesn't — forcing long polling unconditionally (the
// previous setting) left the app stuck on long-held HTTP connections that
// Android's Doze/App Standby power saving silently drops, so a dropped
// connection could sit unnoticed for minutes before the SDK's backoff
// retried it, making moves/messages appear to arrive minutes late.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

// Deferred instead of an eager `getFunctions(app)` at module-eval time — see
// the web client's firebase.ts for why (a dev-bundler race that can make the
// 'functions' component unavailable immediately after initializeApp()).
// Kept the same lazy shape here too so both clients' songService.ts match.
let _functions: Functions | null = null;
export function getFunctionsInstance(): Functions {
  if (!_functions) {
    _functions = getFunctions(app);
  }
  return _functions;
}

let authReadyPromise: Promise<User> | null = null;

/**
 * Ensures the device has an anonymous Firebase identity, signing in if
 * needed, and resolves once a user is available. The resulting uid is used
 * only to tell "my messages" apart from "the other person's" in the shared
 * chat — no profile or account system is built on top of it.
 */
export function ensureAnonymousAuth(): Promise<User> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise<User>((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        user => {
          if (user) {
            unsubscribe();
            resolve(user);
          }
        },
        error => {
          unsubscribe();
          authReadyPromise = null;
          reject(error);
        },
      );

      signInAnonymously(auth).catch(error => {
        unsubscribe();
        authReadyPromise = null;
        reject(error);
      });
    });
  }

  return authReadyPromise;
}

/**
 * Resolves once Firebase Auth has finished restoring any persisted session
 * (from a previous real account login), without ever triggering a sign-in.
 * Returns the restored user only if it's a real (non-anonymous) account —
 * used by AccountScreen to skip the login form when already signed in.
 */
export function getRestoredAccountUser(): Promise<User | null> {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user && !user.isAnonymous ? user : null);
    });
  });
}
