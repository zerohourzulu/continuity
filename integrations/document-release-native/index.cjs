'use strict';
if (process.platform !== 'linux') throw new Error('document-release-native requires Linux; no fallback');
module.exports = require('./build/document_release.node');
