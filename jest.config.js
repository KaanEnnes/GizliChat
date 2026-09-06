module.exports = {
  preset: '@react-native/jest-preset',
  // firebase / @firebase ship ES modules (including .mjs files); without
  // this they're left untransformed like the rest of node_modules and
  // Jest's CJS runtime chokes on their `export` syntax.
  transformIgnorePatterns: [
    // react-native-qrcode-svg (and its react-native-svg dependency) ship
    // untranspiled ESM, so Jest has to transform them like the other RN
    // packages here — without this the whole suite fails to even parse with
    // "SyntaxError: Unexpected token 'export'" as soon as anything imports
    // SettingsModal.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@react-native-firebase|@notifee|firebase|@firebase|react-native-sound|react-native-fs|react-native-svg|react-native-qrcode-svg)/)',
  ],
  transform: {
    '^.+\\.(js|jsx|mjs|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve(
      '@react-native/jest-preset/jest/assetFileTransformer.js',
    ),
  },
};
