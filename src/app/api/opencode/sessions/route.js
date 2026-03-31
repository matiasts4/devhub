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
    return NextResponse.json(normalizeSessions(parsed));
  } catch (error) {
    const message =
      error?.code === 'ENOENT'
        ? 'OpenCode no está instalado o no está en PATH.'
        : 'No se pudieron leer las sesiones de OpenCode.';

    console.error('Failed to list OpenCode sessions:', error);
    return NextResponse.json({ error: message, sessions: [] }, { status: 503 });
  }
}
