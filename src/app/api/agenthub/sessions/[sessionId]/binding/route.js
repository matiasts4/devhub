import { NextResponse } from 'next/server';
import { getDb, reconcileAgentRuntimeSessionBinding } from '@/lib/db/localDb.js';
import { withAuth } from '@/lib/swarm/withAuth.js';

export const POST = withAuth(async function POST(request, { params }, dependencies = {}) {
  try {
    const { sessionId } = await params;
    const body = await request.json();

    if (!body?.workspace_id) {
      return NextResponse.json({ error: 'workspace_id es requerido.' }, { status: 400 });
    }
    if (!body?.run_id) {
      return NextResponse.json({ error: 'run_id es requerido.' }, { status: 400 });
    }
    if (!body?.opencode_session_id) {
      return NextResponse.json({ error: 'opencode_session_id es requerido.' }, { status: 400 });
    }

    const db = (dependencies && dependencies.getDb) || getDb;
    const reconcile =
      (dependencies && dependencies.reconcileAgentRuntimeSessionBinding) ||
      reconcileAgentRuntimeSessionBinding;

    const result = reconcile(db(), {
      session_id: sessionId,
      workspace_id: body.workspace_id,
      run_id: body.run_id,
      opencode_session_id: body.opencode_session_id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
