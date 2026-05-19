const crypto = require('crypto');
const {
  recordTelegramIntentEnvelope,
  getSupervisorApprovalCheckpoint,
  upsertSupervisorApprovalCheckpoint,
} = require('../../src/lib/db/localDb');

const FORBIDDEN_VERB_PATTERN = /^\/(spawn|reanudar|pausar|continuar|reset)\b/i;
const FORBIDDEN_AGENT_MUTATION_PATTERN = /^\/agente\s+.+/i;

function normalizeInboundTelegramIntent(input = {}) {
  const text = String(input.text || '').trim();
  const callbackData = String(input.callback_data || '').trim();

  if (callbackData.startsWith('approve:')) {
    const [, approvalId = '', decision = 'approve'] = callbackData.split(':');
    return {
      actor_id: input.actor_id,
      chat_id: String(input.chat_id),
      message_id: input.message_id ? String(input.message_id) : null,
      update_id: input.update_id ? String(input.update_id) : null,
      action: 'approval.respond',
      target_ref: { approval_id: approvalId },
      payload: { decision },
    };
  }

  if (FORBIDDEN_VERB_PATTERN.test(text) || FORBIDDEN_AGENT_MUTATION_PATTERN.test(text)) {
    return {
      actor_id: input.actor_id,
      chat_id: String(input.chat_id),
      message_id: input.message_id ? String(input.message_id) : null,
      update_id: input.update_id ? String(input.update_id) : null,
      forbidden_reason: 'out-of-scope-orchestration',
      requested_verb: text,
    };
  }

  if (/^\/estado\b/i.test(text) || /^\/status\b/i.test(text)) {
    return {
      actor_id: input.actor_id,
      chat_id: String(input.chat_id),
      message_id: input.message_id ? String(input.message_id) : null,
      update_id: input.update_id ? String(input.update_id) : null,
      action: 'status.query',
      target_ref: {},
      payload: null,
    };
  }

  const taskMatch = text.match(/^\/task\s+(.+)$/i);
  if (taskMatch) {
    return {
      actor_id: input.actor_id,
      chat_id: String(input.chat_id),
      message_id: input.message_id ? String(input.message_id) : null,
      update_id: input.update_id ? String(input.update_id) : null,
      action: 'task.detail',
      target_ref: { task_id: taskMatch[1].trim() },
      payload: null,
    };
  }

  const retryMatch = text.match(/^\/retry\s+(.+)$/i);
  if (retryMatch) {
    return {
      actor_id: input.actor_id,
      chat_id: String(input.chat_id),
      message_id: input.message_id ? String(input.message_id) : null,
      update_id: input.update_id ? String(input.update_id) : null,
      action: 'notification.retry',
      target_ref: { task_id: retryMatch[1].trim() },
      payload: {
        requires_approval: Boolean(input.requires_approval),
        approval_reason: input.approval_reason || 'approval_required',
      },
    };
  }

  return {
    actor_id: input.actor_id,
    chat_id: String(input.chat_id),
    message_id: input.message_id ? String(input.message_id) : null,
    update_id: input.update_id ? String(input.update_id) : null,
    action: 'status.query',
    target_ref: {},
    payload: null,
  };
}

function denyIntent(db, envelope, reason) {
  const intent = recordTelegramIntentEnvelope(db, {
    actor_id: envelope.actor_id,
    chat_id: envelope.chat_id,
    message_id: envelope.message_id,
    update_id: envelope.update_id,
    action: envelope.action || 'status.query',
    target_ref: envelope.target_ref || {},
    payload: {
      ...(envelope.payload || {}),
      denial_reason: reason,
      requested_verb: envelope.requested_verb || null,
    },
    status: 'denied',
    audit_status: 'denied',
  });

  return {
    accepted: false,
    pending_approval: false,
    denial_reason: reason,
    intent,
  };
}

function handleApprovalResponse(db, envelope) {
  const approvalId = envelope?.target_ref?.approval_id;
  const checkpoint = getSupervisorApprovalCheckpoint(db, approvalId);
  if (!checkpoint || checkpoint.status !== 'pending') {
    const denied = recordTelegramIntentEnvelope(db, {
      actor_id: envelope.actor_id,
      chat_id: envelope.chat_id,
      message_id: envelope.message_id,
      update_id: envelope.update_id,
      action: 'approval.respond',
      target_ref: { approval_id: approvalId },
      payload: { decision: envelope?.payload?.decision || 'approve' },
      status: 'denied',
      audit_status: 'denied',
    });

    return {
      accepted: false,
      pending_approval: false,
      denial_reason: 'stale-approval',
      intent: denied,
    };
  }

  const nextStatus = envelope?.payload?.decision === 'reject' ? 'rejected' : 'approved';
  upsertSupervisorApprovalCheckpoint(db, {
    checkpoint_key: approvalId,
    task_id: checkpoint.task_id,
    workspace_id: checkpoint.workspace_id,
    run_id: checkpoint.run_id,
    reason_class: checkpoint.reason_class,
    evidence_ref: checkpoint.evidence_ref,
    status: nextStatus,
    decision_note: `telegram:${envelope.actor_id}:${nextStatus}`,
    decided_at: new Date().toISOString(),
  });

  const intent = recordTelegramIntentEnvelope(db, {
    actor_id: envelope.actor_id,
    chat_id: envelope.chat_id,
    message_id: envelope.message_id,
    update_id: envelope.update_id,
    action: 'approval.respond',
    target_ref: { approval_id: approvalId, task_id: checkpoint.task_id },
    payload: { decision: envelope?.payload?.decision || 'approve' },
    status: 'accepted',
    audit_status: nextStatus,
  });

  return {
    accepted: true,
    pending_approval: false,
    replayed: Boolean(intent.replayed),
    intent,
  };
}

function handleInboundTelegramIntent(db, envelope) {
  if (envelope.forbidden_reason) {
    return denyIntent(db, envelope, envelope.forbidden_reason);
  }

  if (envelope.action === 'approval.respond') {
    return handleApprovalResponse(db, envelope);
  }

  if (envelope.payload?.requires_approval) {
    const checkpointKey = [
      envelope?.target_ref?.task_id || '-',
      envelope?.target_ref?.workspace_id || '-',
      envelope?.target_ref?.run_id || '-',
      envelope.payload.approval_reason || 'approval_required',
      envelope?.target_ref?.approval_id || '-',
    ].join('|');

    upsertSupervisorApprovalCheckpoint(db, {
      checkpoint_key: checkpointKey,
      task_id: envelope?.target_ref?.task_id,
      workspace_id: envelope?.target_ref?.workspace_id,
      run_id: envelope?.target_ref?.run_id,
      reason_class: envelope.payload.approval_reason || 'approval_required',
      evidence_ref: envelope?.target_ref?.approval_id || null,
      status: 'pending',
      requested_at: new Date().toISOString(),
    });

    const intent = recordTelegramIntentEnvelope(db, {
      actor_id: envelope.actor_id,
      chat_id: envelope.chat_id,
      message_id: envelope.message_id,
      update_id: envelope.update_id,
      action: envelope.action,
      target_ref: {
        ...envelope.target_ref,
        approval_id: checkpointKey,
      },
      payload: envelope.payload,
      status: 'pending_approval',
      audit_status: 'pending_approval',
    });

    return {
      accepted: false,
      pending_approval: true,
      intent,
    };
  }

  const intent = recordTelegramIntentEnvelope(db, {
    actor_id: envelope.actor_id,
    chat_id: envelope.chat_id,
    message_id: envelope.message_id,
    update_id: envelope.update_id,
    action: envelope.action,
    target_ref: envelope.target_ref || {},
    payload: envelope.payload || null,
    status: 'accepted',
    audit_status: 'accepted',
    result_ref: `telegram-intent://${crypto.randomUUID()}`,
  });

  return {
    accepted: true,
    pending_approval: false,
    replayed: Boolean(intent.replayed),
    intent,
  };
}

module.exports = {
  normalizeInboundTelegramIntent,
  handleInboundTelegramIntent,
};
