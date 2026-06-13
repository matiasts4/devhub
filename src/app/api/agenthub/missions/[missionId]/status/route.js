import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/swarm/withAuth.js';
import { getSwarmMissionById } from '@/lib/db/swarmMissions.js';
import { listSupervisorApprovalCheckpoints } from '@/lib/db/supervisor.js';

export const runtime = 'nodejs';

// GET /api/agenthub/missions/:missionId/status
// Returns DG mission status for polling loop
export const GET = withAuth(async function GET(_request, context) {
  try {
    const missionId = context?.params?.missionId;
    if (!missionId) {
      return NextResponse.json({ error: 'missionId es requerido.' }, { status: 400 });
    }

    const mission = getSwarmMissionById(missionId);
    if (!mission) {
      return NextResponse.json({ error: 'Mission no encontrada.' }, { status: 404 });
    }

    // approval_required: any pending checkpoint for this mission's task
    const pendingCheckpoints = mission.task_id
      ? listSupervisorApprovalCheckpoints({
          task_id: mission.task_id,
          status: 'pending',
          limit: 1,
        })
      : [];
    const latestCheckpoint = pendingCheckpoints[0] || null;

    return NextResponse.json({
      missionId,
      status: mission.status,
      approval_required: latestCheckpoint != null,
      approval_deadline: latestCheckpoint?.deadline || null,
      last_activity_at: mission.updated_at,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Error al leer mission status.' },
      { status: 500 }
    );
  }
});
