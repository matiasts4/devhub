import { NextResponse } from 'next/server';
const { ACTION_REGISTRY } = require('@/lib/operations/action-registry.js');

/**
 * GET /api/operator/actions
 * Returns full registry minus Tier 4 actions.
 * Used by the UI to render action labels without importing the registry directly.
 */
export async function GET() {
  const actions = Object.entries(ACTION_REGISTRY)
    .filter(([, def]) => def.tier < 4)
    .map(([action_id, def]) => ({
      action_id,
      class: def.class,
      tier: def.tier,
      label: def.label,
    }));

  return NextResponse.json({ actions }, { status: 200 });
}
