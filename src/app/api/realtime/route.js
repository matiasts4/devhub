import path from 'path';
import { NextResponse } from 'next/server';
import { ensureRealtimeServer, getRealtimeStatus } from '@/lib/realtime/devhub-realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

function resolveRootPath(inputPath) {
  const projectRoot = process.cwd();
  const projectRootAbs = path.resolve(/*turbopackIgnore: true*/ projectRoot);
  if (!inputPath) {
    return projectRootAbs;
  }

  const resolved = path.resolve(
    /*turbopackIgnore: true*/ projectRoot,
    /*turbopackIgnore: true*/ inputPath
  );
  if (!resolved.startsWith(projectRootAbs)) {
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
      { status: 501 }
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
      { status: 500 }
    );
  }
}
