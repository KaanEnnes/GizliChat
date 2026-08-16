// @react-native-firebase/messaging wraps a native module that only exists in
// a built app (Android/iOS), not in Jest's mocked native environment — a
// no-op stand-in, same reasoning as __mocks__/react-native-sound.js. Only the
// modular-API exports fcmService.ts actually uses are stubbed.
module.exports = {
  getMessaging: () => ({}),
  getToken: () => Promise.resolve('mock-fcm-token'),
  onMessage: () => () => undefined,
  onTokenRefresh: () => () => undefined,
  setBackgroundMessageHandler: () => undefined,
};
