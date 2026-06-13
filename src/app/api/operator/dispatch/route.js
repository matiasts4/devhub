import { NextResponse } from 'next/server';
import { routeDispatch } from '@/lib/operations/intent-router.js';
import { emit as emitAudit } from '@/lib/operations/audit-emitter.js';

/**
 * POST /api/operator/dispatch
 * Routes action dispatch through the operator contract.
 *
 * Request body:
 *   action_id, params, target, actor_role, actor_session_id,
 *   confirmation (null on first dispatch, receipt on re-entry), devhub_version
 *
 * Responses:
 *   201 — PROCEED with result
 *   200 — CONFIRM_REQUIRED (dialog should open)
 *   200 — DENIED (shows toast)
 *   200 — DEFERRED (shows toast)
 *   400 — malformed request
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    action_id,
    params = {},
    target = null,
    actor_role,
    actor_session_id,
    confirmation = null,
    devhub_version = '0.1.0',
  } = body;

  if (!action_id) {
    return NextResponse.json({ error: 'action_id is required' }, { status: 400 });
  }
  if (!actor_role) {
    return NextResponse.json({ error: 'actor_role is required' }, { status: 400 });
  }
  if (!actor_session_id) {
    return NextResponse.json({ error: 'actor_session_id is required' }, { status: 400 });
  }

  // Route the dispatch through intent router
  const result = routeDispatch({
    action_id,
    params,
    target,
    actor_role,
    actor_session_id,
    confirmation,
    devhub_version,
  });

  // Build common audit context
  const auditContext = (outcome) => ({
    event_id: crypto.randomUUID(),
    action_id,
    action_class: result.actionDef?.class || null,
    actor_role,
    actor_session_id,
    target: target || null,
    params,
    risk_tier: result.actionDef?.tier ?? null,
    confirmation: confirmation || null,
    outcome,
    error_detail: result.error_detail || null,
    devhub_version,
    timestamp: new Date().toISOString(),
  });

  switch (result.status) {
    case 'PROCEED': {
      // Execute the action via adapter boundary
      const { executeAction } = await import('@/lib/operations/adapter-boundary.js');
      let execResult;
      try {
        execResult = await executeAction({
          action_id,
          params,
          target,
          actor_role,
          actor_session_id,
          confirmation,
          devhub_version,
        });
      } catch (execErr) {
        // Emit error audit and return error response
        emitAudit(auditContext('error'));
        return NextResponse.json(
          { status: 'error', error_detail: execErr.message },
          { status: 500 }
        );
      }
      emitAudit({ ...auditContext('success'), confirmed: true });
      return NextResponse.json({ status: 'PROCEED', result: execResult }, { status: 201 });
    }

    case 'CONFIRM_REQUIRED':
      // Return to UI — dialog should open
      return NextResponse.json({
        status: 'CONFIRM_REQUIRED',
        action_id,
        tier: result.actionDef?.tier ?? 2,
      }, { status: 200 });

    case 'DENIED': {
      emitAudit(auditContext('denied'));
      return NextResponse.json({ status: 'DENIED', error_detail: result.error_detail }, { status: 200 });
    }

    case 'DEFERRED': {
      emitAudit(auditContext('deferred'));
      return NextResponse.json({ status: 'DEFERRED', error_detail: result.error_detail }, { status: 200 });
    }

    case 'NAVIGATE_RESTRICTED': {
      emitAudit({ ...auditContext('denied'), error_detail: 'restricted pane' });
      return NextResponse.json({ status: 'DENIED', error_detail: 'restricted pane' }, { status: 200 });
    }

    default:
      return NextResponse.json({ status: 'DEFERRED', error_detail: 'Unexpected router result' }, { status: 200 });
  }
}