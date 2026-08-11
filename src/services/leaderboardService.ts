import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase';
import { sanitizePlayerName } from './playerNameStorage';

export interface HighScoreEntry {
  id: string;
  name: string;
  score: number;
  createdAt: number;
}

// Global, shared across every device — anyone with the app sees the same
// table. Not per-user: there's no auth-gated ownership on these documents.
const HIGHSCORES_COLLECTION = 'highscores';
const TOP_LIMIT = 20;

export async function submitScore(name: string, score: number): Promise<void> {
  // Firestore rules require request.auth != null to write a score. Most
  // players never open the hidden chat (where a real account gets created),
  // so this falls back to lightweight anonymous auth just for write access —
  // it does nothing if the device already has any session (anonymous or a
  // real account).
  await ensureAnonymousAuth();
  const cleanName = sanitizePlayerName(name) || 'Oyuncu';
  await addDoc(collection(db, HIGHSCORES_COLLECTION), {
    name: cleanName,
    score,
    createdAt: serverTimestamp(),
  });
}

export async function fetchTopScores(): Promise<HighScoreEntry[]> {
  const topScoresQuery = query(
    collection(db, HIGHSCORES_COLLECTION),
    orderBy('score', 'desc'),
    limit(TOP_LIMIT),
  );
  const snapshot = await getDocs(topScoresQuery);
  return snapshot.docs.map((docSnap): HighScoreEntry => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: typeof data.name === 'string' ? data.name : '?',
      score: typeof data.score === 'number' ? data.score : 0,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
    };
  });
}
