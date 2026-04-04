import { NextResponse } from 'next/server';
import { getSwarmConfig, setSwarmConfig } from '@/lib/db/localDb.js';

export const runtime = 'nodejs';

/**
 * GET /api/settings/swarm
 * Returns current swarm configuration.
 */
export async function GET() {
  try {
    const config = getSwarmConfig();
    return NextResponse.json({
      maxConcurrent: parseInt(config.max_concurrent, 10) || 5,
      swarmEnabled: config.swarm_enabled !== 'false',
    });
  } catch (err) {
    console.error('[settings/swarm GET] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/settings/swarm
 * Update swarm configuration.
 * Validates maxConcurrent is integer 1-20.
 */
export async function PUT(req) {
  try {
    const body = await req.json();
    const { maxConcurrent, swarmEnabled } = body;

    // Validate maxConcurrent
    if (maxConcurrent !== undefined) {
      const value = parseInt(maxConcurrent, 10);
      if (isNaN(value) || value < 1 || value > 20) {
        return NextResponse.json(
          {
            error: 'maxConcurrent debe ser un número entero entre 1 y 20',
            received: maxConcurrent,
          },
          { status: 400 }
        );
      }
      setSwarmConfig('max_concurrent', String(value));
    }

    // Validate swarmEnabled
    if (swarmEnabled !== undefined) {
      setSwarmConfig('swarm_enabled', swarmEnabled ? 'true' : 'false');
    }

    const config = getSwarmConfig();
    return NextResponse.json({
      success: true,
      maxConcurrent: parseInt(config.max_concurrent, 10) || 5,
      swarmEnabled: config.swarm_enabled !== 'false',
    });
  } catch (err) {
    console.error('[settings/swarm PUT] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
