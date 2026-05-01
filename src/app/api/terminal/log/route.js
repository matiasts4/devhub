import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOG_FILE = path.resolve(process.cwd(), 'data', 'logs', 'terminal-debug.log');

/**
 * POST /api/terminal/log
 * Accepts JSON body: { tag: string, msg: string, extra?: object }
 * Appends a line to data/logs/terminal-debug.log.
 * Used by TerminalTTY.jsx to persist client-side connection events to disk.
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

    return NextResponse.json({ ok: true });
  } catch {
    // Silent — never fail a log write
    return NextResponse.json({ ok: false });
  }
}
