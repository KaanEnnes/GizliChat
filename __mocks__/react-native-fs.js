// react-native-fs wraps a native module that only exists in a built app
// (Android/iOS), not in Jest's mocked native environment — a no-op
// stand-in, same reasoning as __mocks__/react-native-sound.js.
const RNFS = {
  CachesDirectoryPath: '/mock-caches',
  mkdir: () => Promise.resolve(),
  exists: () => Promise.resolve(false),
  downloadFile: () => ({ promise: Promise.resolve({ statusCode: 200 }) }),
  writeFile: () => Promise.resolve(),
  unlink: () => Promise.resolve(),
};

module.exports = RNFS;
module.exports.default = RNFS;
