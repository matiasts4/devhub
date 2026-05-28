async function readProductionSidecarPortDefault() {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const portFile = path.join(os.homedir(), '.devhub', 'sidecar-port.txt');
  if (!fs.existsSync(portFile)) {
    return null;
  }

  const port = Number(fs.readFileSync(portFile, 'utf8').trim());
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }

  try {
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`, {
      cache: 'no-store',
    });
    try {
      await healthResponse.text();
    } catch {
      /* ignore */
    }
    if (healthResponse.ok) {
      return port;
    }
  } catch (error) {
    console.error('Error checking sidecar health:', error);
  }

  return null;
}

export async function closeTerminalSessionById(
  sessionId,
  {
    fetchImpl = fetch,
    readProductionSidecarPortImpl = readProductionSidecarPortDefault,
    closeSessionImpl = null,
    nodeEnv = process.env.NODE_ENV,
  } = {}
) {
  const normalizedSessionId = String(sessionId || '').trim();

  if (!normalizedSessionId) {
    throw new Error('sessionId required');
  }

  if (nodeEnv === 'production') {
    const sidecarPort = await readProductionSidecarPortImpl();
    if (!sidecarPort) {
      const error = new Error('Servidor terminal (sidecar) no encontrado');
      error.status = 503;
      throw error;
    }

    const response = await fetchImpl(
      `http://127.0.0.1:${sidecarPort}/sessions/${encodeURIComponent(normalizedSessionId)}`,
      {
        method: 'DELETE',
        cache: 'no-store',
      }
    );

    try {
      await response.text();
    } catch {
      /* ignore */
    }

    if (!response.ok) {
      const error = new Error('No se pudo cerrar la sesión de terminal.');
      error.status = response.status;
      throw error;
    }

    return { success: true, sessionId: normalizedSessionId };
  }

  const closeSessionFn =
    closeSessionImpl ||
    (await import('@/lib/terminal/ttyServer')).closeSession;

  closeSessionFn(normalizedSessionId);
  return { success: true, sessionId: normalizedSessionId };
}
