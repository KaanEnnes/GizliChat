import { sendLiveLocationMessage, stopLiveLocation, updateLiveLocation } from './chatService';
import {
  clearLocationWatch,
  getCurrentLocation,
  watchLocation,
  LIVE_LOCATION_UPDATE_INTERVAL_MS,
  type Coordinates,
} from './locationService';

export interface ActiveLiveShare {
  roomId: string;
  messageId: string;
  /** Wall-clock ms when this share auto-expires — mirrors the message doc's `liveExpiresAt`. */
  expiresAt: number;
  lastCoords: Coordinates | null;
}

type Listener = (share: ActiveLiveShare | null) => void;

/**
 * Owns the one in-flight "canlı konum" share at module scope, the same shape
 * as the RN app's liveLocationManager — so the share survives navigating away
 * from the chat view instead of freezing at its last fix.
 *
 * Web-specific caveat vs. the phone: this lives in one browser tab. Closing
 * or reloading that tab ends the JS context and the watch with it, so the
 * share stops being updated (`liveExpiresAt` is the backstop that makes both
 * clients render it as ended). Refreshing mid-share therefore orphans it the
 * same way killing the app does on Android.
 */
let active: ActiveLiveShare | null = null;
let watchId: number | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let lastWriteAt = 0;
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

/** True when `messageId` is the share this tab is currently broadcasting (drives the "Canlı Konumu Durdur" affordance). */
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

/** Starts a new live share, replacing whichever one was already running (at most one at a time). */
export async function startLiveShare(roomId: string, senderId: string, durationMs: number): Promise<void> {
  await stopLiveShare();

  const seed = await getCurrentLocation();
  const messageId = await sendLiveLocationMessage(roomId, senderId, seed.latitude, seed.longitude, durationMs);
  active = { roomId, messageId, expiresAt: Date.now() + durationMs, lastCoords: seed };
  lastWriteAt = Date.now();
  emit();

  watchId = watchLocation(
    coords => {
      // Guarded because a fix can still land between clearWatch() and the
      // browser actually stopping — without this it would write to a share
      // that was already ended, or to the previous share's doc.
      if (!active || active.messageId !== messageId) {
        return;
      }
      // The browser's watchPosition has no interval/distance throttle of its
      // own (unlike the RN library's), and fires far more often than a chat
      // pin needs — so writes are rate-limited here instead.
      const now = Date.now();
      if (now - lastWriteAt < LIVE_LOCATION_UPDATE_INTERVAL_MS) {
        return;
      }
      lastWriteAt = now;
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

/** Ends the active share (if any) — clears the watch and marks the message doc as no longer live. */
export async function stopLiveShare(): Promise<void> {
  const ending = active;
  teardownWatch();
  active = null;
  emit();
  if (ending) {
    await stopLiveLocation(ending.roomId, ending.messageId).catch(() => undefined);
  }
}
