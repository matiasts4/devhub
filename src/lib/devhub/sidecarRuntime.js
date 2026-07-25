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
  { fetchImpl = fetch, timeoutMs = 800 } = {}
) {
  const uniquePorts = Array.from(new Set(ports));
  // Launch all probes in parallel, then await them in preference order: the first
  // healthy probe whose higher-preference probes already resolved unhealthy wins.
  // Unlike Promise.all, this short-circuits — a hung lower-preference port does
  // not delay a healthy higher-preference answer. The rejection handler keeps a
  // settled-later probe from surfacing as an unhandled rejection.
  const probePromises = uniquePorts.map((port) =>
    fetchSidecarHealth(port, { fetchImpl, timeoutMs }).then(
      (ok) => ok,
      () => false
    )
  );

  for (let i = 0; i < uniquePorts.length; i += 1) {
    if (await probePromises[i]) {
      return uniquePorts[i];
    }
  }

  return null;
}

async function readProductionSidecarPort({
  fetchImpl = fetch,
  timeoutMs = 800,
  env = process.env,
  homeDir,
} = {}) {
  const home = getCanonicalDevhubDir({ env, homeDir });
  const probeOrder = resolveSidecarProbeOrder(home);
  const trustedPort = resolveTrustedSidecarPortFromFile(home);
  const candidatePorts = Array.from(new Set([trustedPort, ...probeOrder].filter(Boolean)));

  return probeSidecarPorts(candidatePorts, { fetchImpl, timeoutMs });
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
