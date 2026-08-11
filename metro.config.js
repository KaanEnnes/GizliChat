const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      // @firebase/firestore's package.json declares its "react-native"
      // condition as a bare string ("./dist/index.rn.js"), which trips a
      // Metro package-exports resolution bug (it mis-appends platform/
      // extension suffixes onto the already-resolved path and reports the
      // real, existing file as unresolvable). Route it straight to that
      // file, bypassing the buggy lookup; every other module still goes
      // through Metro's normal resolver.
      if (moduleName === '@firebase/firestore') {
        return {
          type: 'sourceFile',
          filePath: path.join(
            __dirname,
            'node_modules/@firebase/firestore/dist/index.rn.js',
          ),
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
