const fs = require('fs');
const path = require('path');
const {
  DEVELOPMENT_SIDECAR_PORT,
  PRODUCTION_SIDECAR_PORT,
  getCanonicalDevhubDir,
  isDevhubDevelopmentHome,
  isDevhubDevelopmentRuntime,
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
  attempts,
  gapMs,
  env = process.env,
  homeDir,
} = {}) {
  const home = getCanonicalDevhubDir({ env, homeDir });
  const probeOrder = resolveSidecarProbeOrder(home);
  const trustedPort = resolveTrustedSidecarPortFromFile(home);
  const healthCheck =
    attempts != null
      ? (port) => fetchSidecarHealthWithRetries(port, { fetchImpl, timeoutMs, attempts, gapMs })
      : (port) => fetchSidecarHealth(port, { fetchImpl, timeoutMs });

  if (trustedPort && (await healthCheck(trustedPort))) {
    return trustedPort;
  }

  for (const port of probeOrder) {
    if (await healthCheck(port)) {
      return port;
    }
  }

  return null;
}

/**
 * Terminal session API: in dev never attach to the installed sidecar (:4000).
 */
async function readSidecarPortForTerminalSession(options = {}) {
  const env = options.env ?? process.env;
  const healthOptions = {
    ...options,
    timeoutMs: options.timeoutMs ?? 450,
    attempts: options.attempts ?? 4,
  };
  if (isDevhubDevelopmentRuntime(env)) {
    const home = getCanonicalDevhubDir({ env, homeDir: options.homeDir });
    const trusted = resolveTrustedSidecarPortFromFile(home);
    const devPort = trusted || DEVELOPMENT_SIDECAR_PORT;
    if (await fetchSidecarHealthWithRetries(devPort, healthOptions)) {
      return devPort;
    }
    return null;
  }
  return readProductionSidecarPort(healthOptions);
}

async function fetchSidecarHealthWithRetries(
  port,
  { fetchImpl = fetch, timeoutMs = 450, attempts = 4, gapMs = 120 } = {}
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await fetchSidecarHealth(port, { fetchImpl, timeoutMs })) {
      return true;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
    }
  }
  return false;
}

module.exports = {
  DEFAULT_SIDECAR_PORTS,
  DEVELOPMENT_SIDECAR_PORT,
  PRODUCTION_SIDECAR_PORT,
  fetchSidecarHealth,
  fetchSidecarHealthWithRetries,
  getSidecarPortFilePath,
  probeSidecarPorts,
  readProductionSidecarPort,
  readSidecarPortForTerminalSession,
  resolveSidecarProbeOrder,
  resolveTrustedSidecarPortFromFile,
};
