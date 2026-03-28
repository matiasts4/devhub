import path from 'path';
import { NextResponse } from 'next/server';
import { ensureRealtimeServer, getRealtimeStatus } from '@/lib/realtime/devhub-realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

function resolveRootPath(inputPath) {
  const projectRoot = process.cwd();
  if (!inputPath) {
    return projectRoot;
  }

  const resolved = path.resolve(projectRoot, inputPath);
  if (!resolved.startsWith(path.resolve(projectRoot))) {
    throw new Error('Invalid root path outside project directory');
  }

  return resolved;
}

export async function GET(request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      {
        ok: false,
        error: 'API route not available in static export build.',
      },
      { status: 501 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const rootPath = resolveRootPath(searchParams.get('root'));

    const info = ensureRealtimeServer({ rootPath });
    return NextResponse.json({
      ok: true,
      info,
      status: getRealtimeStatus(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Failed to initialize realtime server',
      },
      { status: 500 },
    );
  }
}
