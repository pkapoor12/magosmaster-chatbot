const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultAssetExts = require('metro-config/src/defaults/defaults').assetExts;

const config = {
  resolver: {
    assetExts: [...defaultAssetExts, 'bin', 'mil'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);