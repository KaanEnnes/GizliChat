// react-native-nitro-sound wraps a native (Nitro) module that only exists
// in a built app, not in Jest's mocked native environment, so tests get a
// no-op stand-in instead. The real package exports a singleton instance.
module.exports = {
  startRecorder: () => Promise.resolve('mock://recording.m4a'),
  stopRecorder: () => Promise.resolve('mock://recording.m4a'),
  startPlayer: () => Promise.resolve('mock://recording.m4a'),
  pausePlayer: () => Promise.resolve(),
  stopPlayer: () => Promise.resolve(),
  addPlayBackListener: () => {},
  removePlayBackListener: () => {},
};
