// Per-room "last read" timestamps, kept in the browser only — same
// device-local approach as the mobile app's readStatusService.ts (backed by
// AsyncStorage there, localStorage here).
const KEY_PREFIX = 'gizlichat_last_read_';

export function getLastReadAt(roomId: string): number {
  const raw = localStorage.getItem(KEY_PREFIX + roomId);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function markRoomRead(roomId: string, at: number = Date.now()): void {
  localStorage.setItem(KEY_PREFIX + roomId, String(at));
}
