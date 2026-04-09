import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

function normalizeSessions(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.sessions)) return payload.sessions;
  return [];
}

export async function GET() {
  try {
    const { stdout } = await execFileAsync('opencode', [
      'session',
      'list',
      '--format',
      'json',
      '--max-count',
      '20',
    ]);

    const parsed = stdout?.trim() ? JSON.parse(stdout) : [];
    const sessions = normalizeSessions(parsed);

    // Cross-reference with live PTY sessions to detect which OpenCode sessions are currently running
    let activeSessionIds = {};
    try {
      const { getActiveOpenCodeSessionIds } = await import('@/lib/terminal/ttyServer');
      activeSessionIds = getActiveOpenCodeSessionIds();
    } catch {
      // PTY server may not be running yet — sessions won't have isActive flag
    }

    // Build a reverse map: opencodeSessionId → terminalId
    const sessionToTerminal = {};
    for (const [terminalId, sessionId] of Object.entries(activeSessionIds)) {
      sessionToTerminal[sessionId] = terminalId;
    }

    const enriched = sessions.map((s) => ({
      ...s,
      isActive: Boolean(sessionToTerminal[s.id]),
      activePanelId: sessionToTerminal[s.id] || null,
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    const message =
      error?.code === 'ENOENT'
        ? 'OpenCode no está instalado o no está en PATH.'
        : 'No se pudieron leer las sesiones de OpenCode.';

    console.error('Failed to list OpenCode sessions:', error);
    return NextResponse.json({ error: message, sessions: [] }, { status: 503 });
  }
}
