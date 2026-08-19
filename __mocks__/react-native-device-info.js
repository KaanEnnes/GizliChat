// react-native-device-info wraps a native module that only exists in a built
// app, not in Jest's mocked native environment — re-export the package's own
// official Jest mock, same pattern as __mocks__/@react-native-community/netinfo.js.
module.exports = require('react-native-device-info/jest/react-native-device-info-mock');
