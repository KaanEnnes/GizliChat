import { stopLiveLocation, updateLiveLocation, sendLiveLocationMessage } from './chatService';
import { clearLocationWatch, getCurrentLocation, watchLocation, type Coordinates } from './locationService';

export interface ActiveLiveShare {
  roomId: string;
  messageId: string;
  /** Wall-clock ms when this share auto-expires — mirrors the message doc's `liveExpiresAt`. */
  expiresAt: number;
  /** Most recent fix written to Firestore, for an immediate UI reading without waiting on a snapshot. */
  lastCoords: Coordinates | null;
}

type Listener = (share: ActiveLiveShare | null) => void;

/**
 * Owns the one in-flight "canlı konum" share at module scope rather than
 * inside ChatRoomScreen.
 *
 * This is what makes the share actually live: the GPS watch used to be a
 * ChatRoomScreen effect, so simply backing out of the room (or opening
 * another chat, a game, the hub...) unmounted it and silently froze the
 * share at whatever fix it had last written — the receiver kept seeing a
 * "Canlı Konum" bubble with a stale pin and no way to tell. Living here, the
 * watch keeps running and keeps writing for the share's full duration no
 * matter where the user navigates in the app.
 *
 * Still foreground-only by design: Android kills the JS runtime when the app
 * itself is swapped away/killed, and surviving that would need a real
 * foreground service + persistent notification (the same documented
 * limitation as calls/notifications elsewhere in this project — see
 * ObsidianVault). `liveExpiresAt` is the backstop for that case: the bubble
 * renders the share as ended once it passes even if stopLiveLocation() never
 * got a chance to run.
 */
let active: ActiveLiveShare | null = null;
let watchId: number | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach(listener => listener(active));
}

export function subscribeToActiveLiveShare(listener: Listener): () => void {
  listeners.add(listener);
  listener(active);
  return () => {
    listeners.delete(listener);
  };
}

export function getActiveLiveShare(): ActiveLiveShare | null {
  return active;
}

/** True when `messageId` is the share this device is currently broadcasting (drives the "Canlı Konumu Durdur" affordance). */
export function isBroadcasting(messageId: string): boolean {
  return active?.messageId === messageId;
}

function teardownWatch(): void {
  if (watchId !== null) {
    clearLocationWatch(watchId);
    watchId = null;
  }
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
}

/**
 * Starts a new live share, replacing whichever one was already running (at
 * most one at a time — a second share would otherwise leave the first one's
 * message doc live forever with nothing writing to it).
 */
export async function startLiveShare(roomId: string, senderId: string, durationMs: number): Promise<void> {
  await stopLiveShare();

  const seed = await getCurrentLocation();
  const messageId = await sendLiveLocationMessage(roomId, senderId, seed.latitude, seed.longitude, durationMs);
  active = { roomId, messageId, expiresAt: Date.now() + durationMs, lastCoords: seed };
  emit();

  watchId = watchLocation(
    coords => {
      // Guarded because a fix can still land between clearWatch() and the
      // native layer actually stopping — without this it would write to a
      // share that was already ended (or worse, to the previous share's doc
      // after a new one replaced it).
      if (!active || active.messageId !== messageId) {
        return;
      }
      active = { ...active, lastCoords: coords };
      emit();
      updateLiveLocation(roomId, messageId, coords.latitude, coords.longitude).catch(() => undefined);
    },
    () => undefined,
  );

  expiryTimer = setTimeout(() => {
    stopLiveShare().catch(() => undefined);
  }, durationMs);
}

/** Ends the active share (if any) — clears the GPS watch and marks the message doc as no longer live. */
export async function stopLiveShare(): Promise<void> {
  const ending = active;
  teardownWatch();
  active = null;
  emit();
  if (ending) {
    await stopLiveLocation(ending.roomId, ending.messageId).catch(() => undefined);
  }
}
