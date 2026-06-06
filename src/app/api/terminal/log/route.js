import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOG_FILE = path.resolve(process.cwd(), 'data', 'logs', 'terminal-debug.log');

/**
 * Heuristic for printing a log line to the host terminal where `npm run
 * tauri:dev` is running. We only echo xterm-webgl (renderer switcher
 * diagnostics) and renderer-fallback lines; the full stream still goes
 * to the file for post-mortem. Keeps the host terminal readable.
 */
function shouldEchoToStdout(msg, extra) {
  if (typeof msg !== 'string') return false;
  if (msg.includes('xterm-webgl')) return true;
  if (msg.includes('xterm-addon-webgl')) return true;
  if (msg.includes('initializeTerminal')) return true;
  if (msg.includes('native VTE')) return true;
  if (msg.includes('WS ') || msg.includes('WebSocket')) return true;
  if (msg.includes('session API')) return true;
  if (msg.includes('terminal-open')) return true;
  if (msg.includes('force xterm runtime reinit')) return true;
  if (extra && extra.requestedRendererMode) return true;
  if (extra && extra.effectiveRendererMode) return true;
  if (extra && extra.webglProbe) return true;
  return false;
}

/**
 * POST /api/terminal/log
 * Accepts JSON body: { tag: string, msg: string, extra?: object }
 * Appends a line to data/logs/terminal-debug.log AND echoes xterm-webgl
 * diagnostic lines to the host stdout (visible in the `npm run tauri:dev`
 * terminal). Used by TerminalTTY.jsx to persist client-side connection
 * events to disk and surface renderer-switcher lifecycle to the operator.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { tag = 'CLIENT', msg = '', extra = {} } = body;

    const ts = new Date().toISOString();
    const extraStr = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
    const line = `${ts} [${tag}] ${msg}${extraStr}\n`;

    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line);

    if (shouldEchoToStdout(msg, extra)) {
      const extraOut = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';

      console.log(`[devhub-log] [${tag}] ${msg}${extraOut}`);
    }

    return NextResponse.json({ ok: true });
  } catch {
    // Silent — never fail a log write
    return NextResponse.json({ ok: false });
  }
}
