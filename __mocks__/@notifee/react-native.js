// @notifee/react-native wraps a native module that only exists in a built
// app (Android/iOS), not in Jest's mocked native environment — a no-op
// stand-in, same reasoning as __mocks__/react-native-sound.js.
const notifeeMock = {
  createChannel: () => Promise.resolve('mock-channel-id'),
  displayNotification: () => Promise.resolve('mock-notification-id'),
  onBackgroundEvent: () => undefined,
};

module.exports = notifeeMock;
module.exports.default = notifeeMock;
module.exports.AndroidImportance = { HIGH: 4 };
module.exports.EventType = { PRESS: 1 };
