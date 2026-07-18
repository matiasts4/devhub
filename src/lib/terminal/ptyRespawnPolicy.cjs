/**
 * Re-export: canonical copy lives in sidecar-backend (packaged install path).
 * ttyServer / unit tests keep requiring this stable path.
 */
module.exports = require('../../../sidecar-backend/ptyRespawnPolicy.cjs');
