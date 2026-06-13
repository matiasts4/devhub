async function readProductionSidecarPortDefault() {
  const { readProductionSidecarPort } = require('../devhub/sidecarRuntime');
  return readProductionSidecarPort();
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
    closeSessionImpl || (await import('@/lib/terminal/ttyServer')).closeSession;

  closeSessionFn(normalizedSessionId);
  return { success: true, sessionId: normalizedSessionId };
}
