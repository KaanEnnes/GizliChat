// @react-native-firebase/app wraps a native module that only exists in a
// built app (Android/iOS), not in Jest's mocked native environment — a no-op
// stand-in, same reasoning as __mocks__/react-native-sound.js.
module.exports = {
  getApp: () => ({}),
};
