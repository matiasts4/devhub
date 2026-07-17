import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const PERF_DIR = path.resolve(process.cwd(), 'data', 'logs', 'startup-perf');
const LATEST_FILE = path.join(PERF_DIR, 'latest.json');
const HISTORY_FILE = path.join(PERF_DIR, 'history.ndjson');

/**
 * POST /api/terminal/perf
 * Body: startup perf snapshot JSON.
 * Writes data/logs/startup-perf/latest.json (overwrite) + appends history.ndjson.
 * Operator flow: cold open → Terminales → tell the agent "revisá" → read latest.json.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const writtenAt = new Date().toISOString();
    const payload = {
      writtenAt,
      ...body,
    };

    fs.mkdirSync(PERF_DIR, { recursive: true });
    fs.writeFileSync(LATEST_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.appendFileSync(HISTORY_FILE, `${JSON.stringify(payload)}\n`, 'utf8');

    console.log(
      `[devhub-perf] wrote ${LATEST_FILE} reason=${payload.reason || '?'} ` +
        `terminales→panel=${payload.summary?.terminalesToPanelInteractiveMs ?? 'null'}ms ` +
        `warm=${payload.summary?.warmDurationMs ?? 'null'}ms`
    );

    return NextResponse.json({ ok: true, path: 'data/logs/startup-perf/latest.json' });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    if (!fs.existsSync(LATEST_FILE)) {
      return NextResponse.json({ ok: false, error: 'no snapshot yet' }, { status: 404 });
    }
    const raw = fs.readFileSync(LATEST_FILE, 'utf8');
    return NextResponse.json(JSON.parse(raw));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || String(error) },
      { status: 500 }
    );
  }
}
