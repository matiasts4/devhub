import { NextResponse } from 'next/server';
import { writeClientLogEntry } from '@/lib/crashLog';

/**
 * POST /api/client-log
 * Body: { level, message, details?, source?, ts?, userAgent?, href?, build? }
 *
 * Always appends to data/logs/browser.log.
 * Errors/crashes also go to data/logs/crash.log.
 * Severity "crash" writes a JSON dump under data/logs/crash-dumps/.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid-json' }, { status: 400 });
  }

  try {
    const result = await writeClientLogEntry({
      level: body.level || 'log',
      message: body.message || '',
      details: body.details,
      source: body.source,
      ts: body.ts,
      userAgent: body.userAgent,
      href: body.href,
      build: body.build,
    });
    return NextResponse.json({
      ok: true,
      severity: result.severity,
      dump: result.dumpPath ? true : false,
    });
  } catch (err) {
    console.error('[devhub][client-log] write-failed', err?.message);
    return NextResponse.json({ error: 'write-failed' }, { status: 500 });
  }
}
