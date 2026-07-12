/**
 * Shared bash helpers for tests that validate/execute generated shell scripts.
 *
 * On Windows the available `bash` is usually WSL (or Git Bash): it cannot open
 * `C:\Users\...` paths directly, so host paths must be converted with
 * toBashAccessiblePath before invoking bash. On POSIX the conversion is a no-op.
 */

'use strict';

const { spawnSync } = require('child_process');
const { toBashAccessiblePath } = require('../lib/operations/materializeLaunchWrapper');

const hasBash = (() => {
  try {
    return spawnSync('bash', ['-c', 'true']).status === 0;
  } catch {
    return false;
  }
})();

/** `bash -n <file>` with a bash-accessible path. Returns spawnSync result. */
function bashSyntaxCheck(filePath, options = {}) {
  return spawnSync('bash', ['-n', toBashAccessiblePath(filePath)], {
    encoding: 'utf-8',
    ...options,
  });
}

module.exports = { hasBash, bashSyntaxCheck, toBashAccessiblePath };
