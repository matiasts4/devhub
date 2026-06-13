/**
 * @module swarmMessage
 * POST /api/agenthub/swarm/{missionId}/message
 * Handles inter-agent messaging for swarm handoff, including session reactivation.
 */

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/localDb.js';
import { withAuth } from '@/lib/swarm/withAuth.js';
import { persistSession, reactivateSession, getSession } from '@/lib/sdd/SessionPersistence.js';
import { broadcastEvent } from '@/app/api/swarm-phase-events/route.js';

// ---------------------------------------------------------------------------
// POST — Send message to agent within a mission
// ---------------------------------------------------------------------------

export const POST = withAuth(async function POST(request, { params }) {
  const { missionId } = await params;

  if (!missionId) {
    return NextResponse.json({ error: 'missionId is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { recipient, session_id, action, continuation_prompt, payload } = body;

    // Validate recipient or session_id
    if (!recipient && !session_id) {
      return NextResponse.json(
        { error: 'Either recipient (agent_id) or session_id is required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Handle reactivation action
    if (action === 'reactivate') {
      // Look up session by session_id (or find active session for recipient)
      let targetSession = null;
      if (session_id) {
        targetSession = await reactivateSession({ sessionId: session_id });
      } else if (recipient) {
        // Find active session for this agent in this mission
        const db = getDb();
        const row = db
          .prepare(
            `SELECT session_id FROM swarm_sessions
             WHERE mission_id = ? AND agent_id = ? AND status IN ('paused', 'idle')
             ORDER BY updated_at DESC LIMIT 1`
          )
          .get(missionId, recipient);
        if (row) {
          targetSession = await reactivateSession({ sessionId: row.session_id });
        }
      }

      if (!targetSession) {
        return NextResponse.json(
          { error: 'No paused/idle session found for reactivation' },
          { status: 404 }
        );
      }

      // Build continuation prompt
      const prompt =
        continuation_prompt ||
        targetSession.checkpoint ||
        `Resume session ${targetSession.sessionId} from last checkpoint. Continue with the current SDD phase (${targetSession.phase}).`;

      // Emit phase event for reactivation
      try {
        broadcastEvent(
          'agent_status',
          {
            agent_id: targetSession.agentId,
            mission_id: missionId,
            session_id: targetSession.sessionId,
            status: 'active',
            phase: targetSession.phase,
            reactivated_at: now,
          },
          missionId
        );
      } catch {
        // Broadcast is best-effort
      }

      return NextResponse.json({
        success: true,
        action: 'reactivate',
        session_id: targetSession.sessionId,
        agent_id: targetSession.agentId,
        phase: targetSession.phase,
        continuation_prompt: prompt,
        message: `Session ${targetSession.sessionId} reactivated`,
        timestamp: now,
      });
    }

    // Handle generic message forwarding
    const db = getDb();
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Persist the message
    db.prepare(
      `INSERT INTO mission_messages (
        message_id, mission_id, sender_agent_id, message_kind,
        body_summary, evidence_ref, related_task_id, related_workspace_id,
        related_run_id, related_artifact_id, related_approval_checkpoint_key,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'swarm_message', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      messageId,
      missionId,
      recipient || session_id,
      payload?.summary || `Swarm message: ${action || 'info'}`,
      `evidence://swarm-message/${messageId}`,
      payload?.related_task_id || null,
      payload?.related_workspace_id || null,
      payload?.related_run_id || null,
      payload?.related_artifact_id || null,
      payload?.related_approval_checkpoint_key || null,
      now,
      now
    );

    // Broadcast to SSE clients
    try {
      broadcastEvent(
        'agent_status',
        {
          type: 'swarm_message',
          message_id: messageId,
          mission_id: missionId,
          recipient,
          session_id,
          action,
          payload,
          timestamp: now,
        },
        missionId
      );
    } catch {
      // Broadcast is best-effort
    }

    return NextResponse.json({
      success: true,
      message_id: messageId,
      action: action || 'forwarded',
      recipient,
      session_id,
      timestamp: now,
    });
  } catch (error) {
    console.error('[swarm/message POST] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// GET — List messages for a mission
// ---------------------------------------------------------------------------

export const GET = withAuth(async function GET(request, { params }) {
  const { missionId } = await params;

  if (!missionId) {
    return NextResponse.json({ error: 'missionId is required' }, { status: 400 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const messageKind = searchParams.get('kind') || 'swarm_message';

    const db = getDb();
    const messages = db
      .prepare(
        `SELECT
          message_id as id,
          mission_id,
          sender_agent_id as sender_id,
          message_kind as kind,
          body_summary as summary,
          evidence_ref as evidence_ref,
          related_task_id as task_id,
          related_workspace_id as workspace_id,
          related_run_id as run_id,
          related_artifact_id as artifact_id,
          created_at as timestamp
        FROM mission_messages
        WHERE mission_id = ? AND message_kind = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?`
      )
      .all(missionId, messageKind, limit, offset);

    return NextResponse.json({
      success: true,
      messages,
      count: messages.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[swarm/message GET] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
});