// @react-native-documents/picker ships an ESM build that Jest's Babel config
// can't parse (no CJS entry picked up by the "react-native" test env), and it
// wraps a native module that only exists in a built app anyway — no-op
// stand-in instead, same reasoning as __mocks__/react-native-sound.js.
module.exports = {
  pick: () => Promise.resolve([]),
  isErrorWithCode: () => false,
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
};
