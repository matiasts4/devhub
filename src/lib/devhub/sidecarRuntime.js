const fs = require('fs');
const path = require('path');
const {
  DEVELOPMENT_SIDECAR_PORT,
  PRODUCTION_SIDECAR_PORT,
  getCanonicalDevhubDir,
  isDevhubDevelopmentHome,
  readSidecarPortMarker,
} = require('../db/pathResolver');

const DEFAULT_SIDECAR_PORTS = [PRODUCTION_SIDECAR_PORT, DEVELOPMENT_SIDECAR_PORT];

function resolveSidecarProbeOrder(homeDir) {
  return isDevhubDevelopmentHome(homeDir)
    ? [DEVELOPMENT_SIDECAR_PORT, PRODUCTION_SIDECAR_PORT]
    : [PRODUCTION_SIDECAR_PORT, DEVELOPMENT_SIDECAR_PORT];
}

function resolveTrustedSidecarPortFromFile(homeDir) {
  const port = readSidecarPortMarker(homeDir);
  if (!port) return null;
  if (isDevhubDevelopmentHome(homeDir)) {
    return port === DEVELOPMENT_SIDECAR_PORT ? port : null;
  }
  // Installed runtime must never trust a dev sidecar port written into ~/.devhub.
  return port === PRODUCTION_SIDECAR_PORT ? port : null;
}

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
  const home = getCanonicalDevhubDir({ env, homeDir });
  const probeOrder = resolveSidecarProbeOrder(home);
  const trustedPort = resolveTrustedSidecarPortFromFile(home);

  if (trustedPort && (await fetchSidecarHealth(trustedPort, { fetchImpl, timeoutMs }))) {
    return trustedPort;
  }

  return probeSidecarPorts(probeOrder, { fetchImpl, timeoutMs });
}

module.exports = {
  DEFAULT_SIDECAR_PORTS,
  DEVELOPMENT_SIDECAR_PORT,
  PRODUCTION_SIDECAR_PORT,
  fetchSidecarHealth,
  getSidecarPortFilePath,
  probeSidecarPorts,
  readProductionSidecarPort,
  resolveSidecarProbeOrder,
  resolveTrustedSidecarPortFromFile,
};
