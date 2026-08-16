import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-room chat wallpaper, kept only on this device (not synced between the
// two participants) — same spirit as the theme toggle, purely a local
// display preference. Keyed by roomId so each conversation can carry its own
// background, matching the reference design's per-chat wallpaper.
function storageKey(roomId: string): string {
  return `gizlichat_chat_background_${roomId}`;
}

export async function getChatBackground(roomId: string): Promise<string | null> {
  return AsyncStorage.getItem(storageKey(roomId));
}

export async function setChatBackground(roomId: string, dataUri: string | null): Promise<void> {
  if (dataUri === null) {
    await AsyncStorage.removeItem(storageKey(roomId));
  } else {
    await AsyncStorage.setItem(storageKey(roomId), dataUri);
  }
}
