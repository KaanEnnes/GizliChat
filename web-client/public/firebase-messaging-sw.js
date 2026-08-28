// Background/closed-tab half of web push. Runs as a real service worker (no
// bundler, no ES modules) so it uses the Firebase compat CDN scripts — same
// pattern Firebase's own docs use for FCM web. Mirrors the mobile app's
// index.js background handler: data-only payload, disguised game-flavored
// copy, no message text/sender name ever shown (see
// src/services/notificationService.ts on mobile for the shared rationale).
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDcQNyvWOHFYYxC1ToBSHdl0KS62fXAKaU',
  authDomain: 'kaanchatmercan.firebaseapp.com',
  projectId: 'kaanchatmercan',
  storageBucket: 'kaanchatmercan.firebasestorage.app',
  messagingSenderId: '710001652885',
  appId: '1:710001652885:web:5f1dcd75d07c1753efd79c',
});

const NOTIFICATION_TITLE = 'Mini Oyunlar';
const FAKE_GAME_NOTIFICATIONS = [
  'Günlük ödülünü almayı unutma!',
  'Yeni bir yüksek skor kırıldı!',
  'Bugünkü meydan okuma seni bekliyor.',
  'Enerjin doldu, hemen oyna!',
  'Arkadaşın seni skor tablosunda geçti!',
  'Yeni bir mini oyun eklendi, dene!',
];

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const senderId = payload.data && payload.data.senderId;
  const body = FAKE_GAME_NOTIFICATIONS[Math.floor(Math.random() * FAKE_GAME_NOTIFICATIONS.length)];
  self.registration.showNotification(NOTIFICATION_TITLE, {
    body,
    icon: '/vite.svg',
    // Stable per-sender tag: a burst of messages from the same contact
    // replaces the existing notification instead of stacking multiple.
    tag: senderId ? `chat_${senderId}` : 'chat_unknown',
  });
});

// Tapping the notification just focuses/opens the disguised hub — no deep
// link into the chat room, matching the mobile app's design (the real UI
// stays gated behind the hidden gesture + login even when already
// authenticated).
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    }),
  );
});
