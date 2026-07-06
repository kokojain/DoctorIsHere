const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Device builds drop Swift DerivedData (with symlinked .pcm.lock files) inside
// node_modules/expo-modules-jsi; Metro's file watcher chokes on them and then
// silently stops picking up source changes. Keep them out of the file map.
config.resolver.blockList = [/node_modules\/expo-modules-jsi\/apple\/\.(DerivedData|swiftpm)\/.*/];

module.exports = config;
