// react-native-blob-util wraps a native module that only exists in a built
// app, not in Jest's mocked native environment — no-op stand-in instead,
// same reasoning as __mocks__/react-native-sound.js.
module.exports = {
  MediaCollection: {
    copyToMediaStore: () => Promise.resolve('mock://content-uri'),
  },
  config: () => ({
    fetch: () => Promise.resolve({ path: () => '/mock/cache/file' }),
  }),
};
