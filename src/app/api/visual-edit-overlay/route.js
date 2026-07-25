import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
let cachedOverlaySource = null;
const VISUAL_EDIT_OVERLAY_LOG_PREFIX = '[devhub][visual-edit-overlay]';

function overlayLog(level, event, details = {}) {
  if (level === 'error') {
    console.error(`${VISUAL_EDIT_OVERLAY_LOG_PREFIX} ${event}`, details);
    return;
  }
  console.warn(`${VISUAL_EDIT_OVERLAY_LOG_PREFIX} ${event}`, details);
}

function getVisualEditOverlaySource() {
  if (typeof cachedOverlaySource === 'string') {
    overlayLog('debug', 'overlay-cache-hit', { bytes: cachedOverlaySource.length });
    return cachedOverlaySource;
  }

  const overlayPath = path.join(
    process.cwd(),
    'node_modules/@emergentbase/visual-edits/dist/visual-edit-overlay.js'
  );
  cachedOverlaySource = fs.readFileSync(overlayPath, 'utf8');
  // Inject a debug log at the very beginning of the script
  cachedOverlaySource = `console.log('[devhub][overlay] script executing');` + cachedOverlaySource;
  overlayLog('info', 'overlay-loaded', { overlayPath, bytes: cachedOverlaySource.length });
  return cachedOverlaySource;
}

export async function GET() {
  try {
    return new NextResponse(getVisualEditOverlaySource(), {
      status: 200,
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    overlayLog('error', 'overlay-load-failed', {
      message: error?.message || 'unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to load visual edit overlay', detail: error?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
