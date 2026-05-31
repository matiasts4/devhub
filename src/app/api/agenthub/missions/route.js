import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/swarm/withAuth.js';

export const runtime = 'nodejs';

// POST /api/agenthub/missions — submit a DG mission request
export const POST = withAuth(async function POST(request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'body inválido.' }, { status: 400 });
    }

    if (body.type === 'director-general-mission-request') {
      // Check if Director is reachable (simulated: check swarm process health)
      // In production this would ping the swarm-director service
      // For now, return a mock response — in production, integrate with swarmMissions.js
      const directorReachable = await checkDirectorHealth(request);
      if (!directorReachable) {
        return NextResponse.json({ status: 'director-offline' }, { status: 200 });
      }

      const missionId = body.missionId;
      if (!missionId) {
        return NextResponse.json({ error: 'missionId es requerido.' }, { status: 400 });
      }

      return NextResponse.json({ missionId, status: 'pending' }, { status: 201 });
    }

    return NextResponse.json({ error: 'type no soportado.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Error al procesar mission request.' },
      { status: 500 }
    );
  }
});

async function checkDirectorHealth(request) {
  try {
    const base = request.headers?.get('origin') || 'http://localhost:3000';
    const response = await fetch(`${base}/api/agenthub/operations/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    const processSource = payload?.sources?.find((s) => s.key === 'opencode-process');
    return processSource?.status === 'healthy';
  } catch {
    return false;
  }
}
