import { NextResponse } from 'next/server';
import { getMissionBusSnapshot } from '@/lib/db/swarmMissions';

export const runtime = 'nodejs';

// GET /api/agenthub/swarm/:missionId/bus-snapshot
export async function GET(_request, { params }) {
  try {
    const { missionId } = (await params) || {};
    if (!missionId) {
      return NextResponse.json({ error: 'missionId es requerido.' }, { status: 400 });
    }

    const snapshot = getMissionBusSnapshot(missionId);
    return NextResponse.json(snapshot);
  } catch (error) {
    const status = error instanceof TypeError ? 400 : 500;
    return NextResponse.json({ error: error.message || 'Error al leer bus snapshot.' }, { status });
  }
}
