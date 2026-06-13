'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

/**
 * `devhub swarm-evidence [launchId]` — collect a paste-ready evidence bundle.
 *
 * @param {string} [launchId]
 */
function swarmEvidenceCommand(launchId = 'latest') {
  const scriptPath = path.resolve(__dirname, '../../scripts/collect-swarm-launch-evidence.mjs');
  const result = spawnSync(process.execPath, [scriptPath, launchId], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '../..'),
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

module.exports = swarmEvidenceCommand;