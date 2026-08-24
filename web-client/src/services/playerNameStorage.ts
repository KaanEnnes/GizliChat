// Asked once, the first time the player loses a game — reused silently for
// every future leaderboard submission. Mirrors the mobile app's
// playerNameStorage.ts (AsyncStorage there, localStorage here).
const STORAGE_KEY = 'gizlichat_player_name';
const MAX_NAME_LENGTH = 24;

export function sanitizePlayerName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME_LENGTH);
}

export function getSavedPlayerName(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function savePlayerName(name: string): void {
  const clean = sanitizePlayerName(name);
  if (!clean) return;
  localStorage.setItem(STORAGE_KEY, clean);
}
