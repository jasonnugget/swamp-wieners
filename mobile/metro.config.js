const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
// Mobile has its own lockfile, rather than an npm workspace. Make the maintained
// shared calculations visible to Metro without watching runtime records/uploads.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../shared')];
module.exports = config;
