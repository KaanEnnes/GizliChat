import AsyncStorage from '@react-native-async-storage/async-storage';

// The player is asked for a display name only once (the first time they lose
// a game); it's then reused silently for every future leaderboard submission.
const STORAGE_KEY = 'gizlichat_player_name';
const MAX_NAME_LENGTH = 24;

export function sanitizePlayerName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME_LENGTH);
}

export async function getSavedPlayerName(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function savePlayerName(name: string): Promise<void> {
  const clean = sanitizePlayerName(name);
  if (!clean) {
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, clean);
}
