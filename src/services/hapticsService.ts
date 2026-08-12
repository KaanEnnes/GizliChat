import { Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Same cached-flag + AsyncStorage pattern as soundService/notificationService.
const VIBRATION_ENABLED_KEY = 'gizlichat_vibration_enabled';
let vibrationEnabled = true;

AsyncStorage.getItem(VIBRATION_ENABLED_KEY).then(value => {
  if (value === '0') {
    vibrationEnabled = false;
  }
});

export function isVibrationEnabled(): boolean {
  return vibrationEnabled;
}

export function setVibrationEnabled(enabled: boolean): void {
  vibrationEnabled = enabled;
  AsyncStorage.setItem(VIBRATION_ENABLED_KEY, enabled ? '1' : '0').catch(() => undefined);
}

/** Short buzz — used for light feedback like a new notification toast. */
export function vibrateShort(): void {
  if (vibrationEnabled) {
    Vibration.vibrate(30);
  }
}

/** Slightly longer buzz — used for game-over across every mini-game. */
export function vibrateMedium(): void {
  if (vibrationEnabled) {
    Vibration.vibrate(60);
  }
}
