import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/swarm/withAuth.js';

export const runtime = 'nodejs';

const VALID_DECISIONS = new Set(['approved', 'rejected']);

// POST /api/agenthub/missions/:missionId/reply — post approval/rejection
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

    if (body.type === 'director-general-approval-reply') {
      const {
        approvalItemId,
        decision,
        decidedBy: _decidedBy,
        decidedAt: _decidedAt,
        authority: _authority,
      } = body;

      if (!approvalItemId) {
        return NextResponse.json({ error: 'approvalItemId es requerido.' }, { status: 400 });
      }
      if (!VALID_DECISIONS.has(decision)) {
        return NextResponse.json(
          { error: `decision inválida: ${decision}. Usá approved o rejected.` },
          { status: 400 }
        );
      }

      // In production: forward to swarm-director via mission inbox
      // For now, return success — real implementation would call swarm-director
      return NextResponse.json({ success: true, missionId, approvalItemId, decision });
    }

    return NextResponse.json({ error: 'type no soportado.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Error al procesar approval reply.' },
      { status: 500 }
    );
  }
});
