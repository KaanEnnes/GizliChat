// react-native-sound wraps a native module that only exists in a built app
// (Android/iOS), not in Jest's mocked native environment, so tests get a
// no-op stand-in instead.
class SoundMock {
  constructor(_file, _basePath, callback) {
    if (callback) {
      callback(null);
    }
  }

  play(callback) {
    if (callback) {
      callback(true);
    }
  }

  stop(callback) {
    if (callback) {
      callback();
    }
  }

  release() {}
}

SoundMock.setCategory = () => {};
SoundMock.MAIN_BUNDLE = '';

module.exports = SoundMock;
