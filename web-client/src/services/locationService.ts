export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Preset durations offered for "canlı konum" (live location) sharing — kept identical to the RN app's locationService so both clients offer the same choices. */
export const LIVE_LOCATION_DURATIONS_MS = [
  { label: '15 dakika', ms: 15 * 60 * 1000 },
  { label: '1 saat', ms: 60 * 60 * 1000 },
  { label: '8 saat', ms: 8 * 60 * 60 * 1000 },
] as const;

/** How often a new fix is allowed through while live-sharing — trades battery/Firestore writes for freshness. */
export const LIVE_LOCATION_UPDATE_INTERVAL_MS = 15_000;

function toError(error: GeolocationPositionError): Error {
  // The browser's own messages are English and often empty, so these are
  // written out in Turkish to match the rest of the UI.
  if (error.code === error.PERMISSION_DENIED) {
    return new Error('Konum izni verilmedi. Tarayıcı ayarlarından bu siteye konum izni ver.');
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return new Error('Konum alınamadı — cihaz konumu belirleyemedi.');
  }
  if (error.code === error.TIMEOUT) {
    return new Error('Konum alınamadı — zaman aşımı.');
  }
  return new Error(error.message || 'Konum alınamadı');
}

/** One-off fix, used both for "mevcut konumu gönder" and to seed a live share before watchPosition takes over. */
export function getCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Bu tarayıcı konum paylaşmayı desteklemiyor.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(toError(error)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}

/** Starts watching fixes for an active live-location share. Returns a watch id for clearLocationWatch. */
export function watchLocation(onUpdate: (coords: Coordinates) => void, onError: (error: Error) => void): number {
  if (!navigator.geolocation) {
    onError(new Error('Bu tarayıcı konum paylaşmayı desteklemiyor.'));
    return -1;
  }
  return navigator.geolocation.watchPosition(
    position => onUpdate({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    error => onError(toError(error)),
    // No distanceFilter/interval equivalent in the browser API (those are
    // react-native-community/geolocation extensions), so liveLocationManager
    // throttles writes on this side instead.
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
  );
}

export function clearLocationWatch(watchId: number): void {
  if (watchId >= 0) {
    navigator.geolocation.clearWatch(watchId);
  }
}

/** Opens the coordinates in Google Maps in a new tab — the web equivalent of the RN app's `geo:` intent. */
export function buildMapsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
