/**
 * @module core
 * Thin re-export shim — canonical source is localDb.js.
 * All other modules import from here; this file re-exports everything
 * from localDb.js so existing import paths continue to work.
 */

'use strict';

const localDb = require('./localDb');

module.exports = localDb;
