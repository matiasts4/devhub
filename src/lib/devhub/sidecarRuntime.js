const fs = require('fs');
const path = require('path');
const { getCanonicalDevhubDir } = require('../db/pathResolver');

const DEFAULT_SIDECAR_PORTS = [4000, 4001];

function getSidecarPortFilePath(options = {}) {
  return path.join(getCanonicalDevhubDir(options), 'sidecar-port.txt');
}

async function fetchSidecarHealth(port, { fetchImpl = fetch, timeoutMs = 2500 } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
      cache: 'no-store',
      signal: controller.signal,
    });

    try {
      await response.text();
    } catch {
      /* ignore */
    }

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function probeSidecarPorts(
  ports = DEFAULT_SIDECAR_PORTS,
  { fetchImpl = fetch, timeoutMs = 2500 } = {}
) {
  for (const port of ports) {
    if (await fetchSidecarHealth(port, { fetchImpl, timeoutMs })) {
      return port;
    }
  }

  return null;
}

async function readProductionSidecarPort({
  fetchImpl = fetch,
  timeoutMs = 2500,
  env = process.env,
  homeDir,
} = {}) {
  const portFile = getSidecarPortFilePath({ env, homeDir });
  if (!fs.existsSync(portFile)) {
    return probeSidecarPorts(DEFAULT_SIDECAR_PORTS, { fetchImpl, timeoutMs });
  }

  const port = Number(fs.readFileSync(portFile, 'utf8').trim());
  if (!Number.isInteger(port) || port <= 0) {
    return probeSidecarPorts(DEFAULT_SIDECAR_PORTS, { fetchImpl, timeoutMs });
  }

  if (await fetchSidecarHealth(port, { fetchImpl, timeoutMs })) {
    return port;
  }

  return probeSidecarPorts(
    DEFAULT_SIDECAR_PORTS.filter((candidate) => candidate !== port),
    { fetchImpl, timeoutMs }
  );
}

module.exports = {
  DEFAULT_SIDECAR_PORTS,
  fetchSidecarHealth,
  getSidecarPortFilePath,
  probeSidecarPorts,
  readProductionSidecarPort,
};
