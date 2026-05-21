const os = require('os');
const { resolveTerminalSpawnCwd } = require('../src/lib/terminal/cwdGuard.js');

function resolveSidecarSessionCwd(requestedCwd) {
  return resolveTerminalSpawnCwd(requestedCwd, {
    processCwd: process.cwd(),
    homeDir: os.homedir(),
  });
}

module.exports = {
  resolveSidecarSessionCwd,
};
