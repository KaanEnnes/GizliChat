// Web port of the mobile app's src/services/notificationService.ts — same
// on/off flag (localStorage instead of AsyncStorage) and same disguised,
// game-flavored copy, so a real push never reveals anything about the chat
// underneath even if someone else glances at the screen.
const NOTIFICATIONS_ENABLED_KEY = 'gizlichat_notifications_enabled';

export function isNotificationsEnabled(): boolean {
  return localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) !== '0';
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? '1' : '0');
}

const FAKE_GAME_NOTIFICATIONS = [
  'Günlük ödülünü almayı unutma!',
  'Yeni bir yüksek skor kırıldı!',
  'Bugünkü meydan okuma seni bekliyor.',
  'Enerjin doldu, hemen oyna!',
  'Arkadaşın seni skor tablosunda geçti!',
  'Yeni bir mini oyun eklendi, dene!',
];

export function randomFakeNotification(): string {
  return FAKE_GAME_NOTIFICATIONS[Math.floor(Math.random() * FAKE_GAME_NOTIFICATIONS.length)];
}

// Mirrors mobile's activeChatUid: which contact's room is open right now, so
// a push from that same contact is suppressed instead of popping while
// you're already looking at the conversation.
let activeChatUid: string | null = null;

export function setActiveChatUid(uid: string | null): void {
  activeChatUid = uid;
}

export function isActiveChatUid(uid: string): boolean {
  return activeChatUid === uid;
}
