'use strict';

// Thin barrel re-export — zero logic, pure path resolution.
const compactReads = require('../../src/lib/db/compactReads.js');
const { getDb, closeDb } = require('../../src/lib/db/core.js');

module.exports = { ...compactReads, getDb, closeDb };
