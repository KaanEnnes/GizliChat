import Geolocation from '@react-native-community/geolocation';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Preset durations offered for "canlı konum" (live location) sharing, WhatsApp-style. */
export const LIVE_LOCATION_DURATIONS_MS = [
  { label: '15 dakika', ms: 15 * 60 * 1000 },
  { label: '1 saat', ms: 60 * 60 * 1000 },
  { label: '8 saat', ms: 8 * 60 * 60 * 1000 },
] as const;

/** How often watchPosition is allowed to report a new fix while live-sharing — trades battery/Firestore writes for freshness. */
export const LIVE_LOCATION_UPDATE_INTERVAL_MS = 15_000;

/** One-off GPS fix, used both for "mevcut konumu gönder" and to seed a live-location share before watchPosition takes over. */
export function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(new Error(error.message || 'Konum alınamadı')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}

/** Starts watching GPS fixes for an active live-location share. Returns a watch id for clearLocationWatch. */
export function watchLocation(onUpdate: (coords: Coordinates) => void, onError: (error: Error) => void): number {
  return Geolocation.watchPosition(
    position => onUpdate({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    error => onError(new Error(error.message || 'Konum izlenemedi')),
    {
      enableHighAccuracy: true,
      distanceFilter: 10,
      interval: LIVE_LOCATION_UPDATE_INTERVAL_MS,
      fastestInterval: LIVE_LOCATION_UPDATE_INTERVAL_MS,
    },
  );
}

export function clearLocationWatch(watchId: number): void {
  Geolocation.clearWatch(watchId);
}

/** Opens the device's default maps app (chooser on Android) centered on the given coordinates — avoids pulling in a full maps SDK just to preview a pin. */
export function buildMapsUrl(latitude: number, longitude: number): string {
  return `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
}
