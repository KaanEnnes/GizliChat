// Wraps native camera/gallery pickers that don't exist in Jest's mocked
// native environment, so tests get a no-op stand-in that always "cancels".
module.exports = {
  launchImageLibrary: (_options, callback) => callback({ didCancel: true }),
  launchCamera: (_options, callback) => callback({ didCancel: true }),
};
