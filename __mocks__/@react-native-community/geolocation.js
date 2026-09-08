// @react-native-community/geolocation wraps a native module that only
// exists in a built app, not in Jest's mocked native environment — same
// no-op pattern as react-native-sound.js/react-native-video.js in this
// folder.
module.exports = {
  requestAuthorization: () => {},
  setRNConfiguration: () => {},
  getCurrentPosition: (success) => {
    success({ coords: { latitude: 0, longitude: 0, accuracy: 0 }, timestamp: Date.now() });
  },
  watchPosition: () => 1,
  clearWatch: () => {},
  stopObserving: () => {},
};
