// @react-native-community/netinfo wraps a native module that only exists in
// a built app, not in Jest's mocked native environment — re-export the
// package's own official Jest mock (see its jest/netinfo-mock.js) so it's
// picked up automatically the same way the other native deps under
// __mocks__/ are (react-native-sound, react-native-video, etc.).
module.exports = require('@react-native-community/netinfo/jest/netinfo-mock');
