import AsyncStorage from '@react-native-async-storage/async-storage';

// Mirrors soundService's isSoundEnabled/setSoundEnabled pattern: a
// module-level cached flag (read synchronously by NotificationCenter on
// every incoming message) backed by AsyncStorage for persistence.
const NOTIFICATIONS_ENABLED_KEY = 'gizlichat_notifications_enabled';
let notificationsEnabled = true;

AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY).then(value => {
  if (value === '0') {
    notificationsEnabled = false;
  }
});

export function isNotificationsEnabled(): boolean {
  return notificationsEnabled;
}

export function setNotificationsEnabled(enabled: boolean): void {
  notificationsEnabled = enabled;
  AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? '1' : '0').catch(() => undefined);
}
