import { NextResponse } from 'next/server';
import { updateSessionStatus } from '@/lib/db/localDb.js';
import processManager from '@/lib/swarm/processManager';

const OPENCODE_PORT = process.env.OPENCODE_PORT || 4154;
const OPENCODE_URL = `http://127.0.0.1:${OPENCODE_PORT}`;

export async function abortAgentHubSessionById(
  sessionId,
  {
    fetchImpl = fetch,
    updateSessionStatusImpl = updateSessionStatus,
    processManagerImpl = processManager,
    opencodeUrl = OPENCODE_URL,
  } = {}
) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    throw new Error('sessionId is required');
  }

  const res = await fetchImpl(`${opencodeUrl}/session/${normalizedSessionId}/abort`, {
    method: 'POST',
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const error = new Error(`OpenCode abort failed: ${errText}`);
    error.status = res.status;
    throw error;
  }

  updateSessionStatusImpl(normalizedSessionId, 'aborted');
  processManagerImpl.untrackSession(normalizedSessionId);

  return { success: true };
}

/**
 * POST /api/agenthub/sessions/[sessionId]/abort
 *
 * Forwards an abort request to the OpenCode headless server using the correct
 * server-side OPENCODE_PORT (not the client-side NEXT_PUBLIC_OPENCODE_PORT).
 */
export async function POST(_req, { params }) {
  try {
    const { sessionId } = await params;
    const result = await abortAgentHubSessionById(sessionId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Error aborting OpenCode session:', err);
    return NextResponse.json({ error: err.message }, { status: err?.status || 500 });
  }
}
