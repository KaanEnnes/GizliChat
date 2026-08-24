import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { db, ensureAnonymousAuth } from './firebase';
import { sanitizePlayerName } from './playerNameStorage';

export interface HighScoreEntry {
  id: string;
  name: string;
  score: number;
  createdAt: number;
}

// Same shared `highscores` collection as the mobile app — a web player and a
// mobile player racing the same game see the same table.
const HIGHSCORES_COLLECTION = 'highscores';
const TOP_LIMIT = 20;

export async function submitScore(name: string, score: number, game: string): Promise<void> {
  await ensureAnonymousAuth();
  const cleanName = sanitizePlayerName(name) || 'Oyuncu';
  await addDoc(collection(db, HIGHSCORES_COLLECTION), {
    name: cleanName,
    score,
    game,
    createdAt: serverTimestamp(),
  });
}

export async function fetchTopScores(game: string): Promise<HighScoreEntry[]> {
  const topScoresQuery = query(
    collection(db, HIGHSCORES_COLLECTION),
    where('game', '==', game),
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
