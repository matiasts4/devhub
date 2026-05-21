import { NextResponse } from 'next/server';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const LOG_DIR = join(process.cwd(), 'data', 'logs');
const LOG_FILE = join(LOG_DIR, 'browser.log');

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  const { level = 'log', message = '', details, source, ts } = body;
  const timestamp = ts ? new Date(ts).toISOString() : new Date().toISOString();
  const detailsStr = details !== undefined ? ' ' + JSON.stringify(details) : '';
  const sourceStr = source ? ` (${source})` : '';
  const line = `[${timestamp}] [${level.toUpperCase()}]${sourceStr} ${message}${detailsStr}\n`;

  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(LOG_FILE, line, 'utf-8');
  } catch (err) {
    console.error('[devhub][client-log] write-failed', err?.message);
    return NextResponse.json({ error: 'write-failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
