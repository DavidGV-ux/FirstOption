// Metro configuration for Órbita Salud.
//
// expo-sqlite (web) imports its WebAssembly module as
// `./wa-sqlite/wa-sqlite.wasm`. By default Metro does not know how to
// resolve `.wasm`, so the web bundle fails with "Unable to resolve
// './wa-sqlite/wa-sqlite.wasm'". Registering the extension as an asset
// makes Metro emit an asset URL, which is what wa-sqlite expects.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}
config.resolver.sourceExts = config.resolver.sourceExts.filter((ext) => ext !== 'wasm');

module.exports = config;
