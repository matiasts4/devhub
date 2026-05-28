import { NextResponse } from 'next/server';
import { getSwarmConfig, setSwarmConfig } from '@/lib/db/localDb.js';
import { withAuth } from '@/lib/swarm/withAuth.js';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const config = getSwarmConfig();
    return NextResponse.json({
      max_concurrent_swarms: parseInt(config.max_concurrent_swarms, 10) || 5,
      swarm_enabled: config.swarm_enabled !== 'false',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export const PUT = withAuth(async function PUT(req) {
  try {
    const body = await req.json();

    if (body.max_concurrent_swarms !== undefined) {
      const val = parseInt(body.max_concurrent_swarms, 10);
      if (isNaN(val) || val < 1 || val > 20) {
        return NextResponse.json(
          { error: 'max_concurrent_swarms debe ser un número entre 1 y 20' },
          { status: 400 }
        );
      }
      setSwarmConfig('max_concurrent_swarms', String(val));
    }

    if (body.swarm_enabled !== undefined) {
      setSwarmConfig('swarm_enabled', body.swarm_enabled ? 'true' : 'false');
    }

    const config = getSwarmConfig();
    return NextResponse.json({
      max_concurrent_swarms: parseInt(config.max_concurrent_swarms, 10) || 5,
      swarm_enabled: config.swarm_enabled !== 'false',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});
