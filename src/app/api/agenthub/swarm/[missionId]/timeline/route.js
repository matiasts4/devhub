import { NextResponse } from 'next/server';
import { appendTimelineRow, getTimelineRows } from '@/lib/db/swarmMissions';
import { withAuth } from '@/lib/swarm/withAuth.js';

export const runtime = 'nodejs';

// GET /api/agenthub/swarm/:missionId/timeline
export const GET = withAuth(async function GET(_request, context) {
  try {
    const missionId = context?.params?.missionId;
    if (!missionId) {
      return NextResponse.json({ error: 'missionId es requerido.' }, { status: 400 });
    }

    const rows = getTimelineRows(missionId);
    return NextResponse.json({ missionId, rows });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Error al leer timeline.' },
      { status: 500 }
    );
  }
});

// POST /api/agenthub/swarm/:missionId/timeline
export const POST = withAuth(async function POST(request, context) {
  try {
    const missionId = context?.params?.missionId;
    if (!missionId) {
      return NextResponse.json({ error: 'missionId es requerido.' }, { status: 400 });
    }

    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'body inválido.' }, { status: 400 });
    }

    const row = appendTimelineRow(missionId, body);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    const status = error.message.includes('no es válido') ? 400 : 500;
    return NextResponse.json({ error: error.message || 'Error al escribir timeline row.' }, { status });
  }
});
