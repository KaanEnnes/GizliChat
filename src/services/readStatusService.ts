import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-room "last read" timestamps, kept on-device only (no unread state is
// synced through Firestore) — good enough since read status only needs to
// drive this device's own contact-list badges, not multi-device sync.
const KEY_PREFIX = 'gizlichat_last_read_';

export async function getLastReadAt(roomId: string): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY_PREFIX + roomId);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function markRoomRead(roomId: string, at: number = Date.now()): Promise<void> {
  await AsyncStorage.setItem(KEY_PREFIX + roomId, String(at));
}
