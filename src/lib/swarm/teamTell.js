/* global require, module */
const { createMissionMessage, upsertMessageDelivery } = require('../db/localDb');

const DURABLE_DELIVERY_STATES = new Set(['pending', 'sent', 'failed', 'retry_pending', 'expired']);

function sanitizeRecipients(recipients = []) {
  return Array.from(new Set((recipients || []).filter(Boolean)));
}

function normalizeFailureReason(value) {
  if (!value || typeof value !== 'string') return 'transport_failed';
  return value.trim() || 'transport_failed';
}

function mapAdapterOutcome(result, error) {
  if (result?.accepted === true) {
    return {
      status: 'sent',
      reason: 'binding_found',
      delivery_ref: result.delivery_ref || null,
      evidence_ref: result.evidence_ref || null,
      last_error: null,
    };
  }

  if (result?.accepted === false && DURABLE_DELIVERY_STATES.has(result.status)) {
    return {
      status: result.status,
      reason: normalizeFailureReason(result.failure_class || result.reason),
      delivery_ref: result.delivery_ref || null,
      evidence_ref: result.evidence_ref || null,
      last_error: normalizeFailureReason(result.failure_class || result.reason),
    };
  }

  const failureClass = normalizeFailureReason(
    result?.failure_class || error?.failure_class || error?.message
  );
  const wantsRetry = result?.retry_requested === true || error?.retry_requested === true;

  return {
    status: wantsRetry ? 'retry_pending' : 'failed',
    reason: failureClass,
    delivery_ref: result?.delivery_ref || null,
    evidence_ref: result?.evidence_ref || null,
    last_error: failureClass,
  };
}

function normalizeResolverOutcome(binding, recipientAgentId) {
  if (binding?.status === 'bound') {
    return {
      status: 'bound',
      agent_id: recipientAgentId,
      session_id: binding.session_id || null,
      opencode_session_id: binding.opencode_session_id || null,
      workspace_id: binding.workspace_id || null,
      run_id_or_session_id: binding.run_id_or_session_id || null,
      reason: binding.reason || 'binding_found',
      agent_model: binding.agent_model || null,
      cwd: binding.cwd || null,
    };
  }

  return {
    status: 'unbound',
    agent_id: recipientAgentId,
    session_id: binding?.session_id || null,
    opencode_session_id: null,
    workspace_id: binding?.workspace_id || null,
    run_id_or_session_id: binding?.run_id_or_session_id || null,
    reason: binding?.reason || 'binding_missing',
    agent_model: null,
    cwd: null,
  };
}

function assertDurableDeliveryState(status) {
  if (!DURABLE_DELIVERY_STATES.has(status)) {
    throw new Error(`status inválido para message_deliveries: ${status}`);
  }
}

function createTeamTell({
  db,
  now = () => new Date().toISOString(),
  resolveTargetBinding,
  sendToVerifiedSession,
  createMissionMessageFn = createMissionMessage,
  upsertMessageDeliveryFn = upsertMessageDelivery,
} = {}) {
  if (!db) throw new Error('db es requerido para teamTell.');
  if (typeof resolveTargetBinding !== 'function') {
    throw new Error('resolveTargetBinding es requerido para teamTell.');
  }
  if (typeof sendToVerifiedSession !== 'function') {
    throw new Error('sendToVerifiedSession es requerido para teamTell.');
  }

  return async function teamTell(input = {}) {
    const recipients = sanitizeRecipients(input.recipients);

    if (!input.mission_id) throw new Error('mission_id es requerido para teamTell.');
    if (!input.sender_agent_id) throw new Error('sender_agent_id es requerido para teamTell.');
    if (!input.body_summary || !String(input.body_summary).trim()) {
      throw new Error('body_summary es requerido para teamTell.');
    }
    if (recipients.length === 0) throw new Error('recipients es requerido para teamTell.');

    const timestamp = now();
    const message = createMissionMessageFn(db, {
      mission_id: input.mission_id,
      sender_agent_id: input.sender_agent_id,
      message_kind: input.message_kind || 'directive',
      body_summary: String(input.body_summary).trim(),
      evidence_ref: input.evidence_ref || null,
      related_task_id: input.related_task_id || null,
      related_workspace_id: input.related_workspace_id || null,
      related_run_id: input.related_run_id || null,
      related_artifact_id: input.related_artifact_id || null,
      related_approval_checkpoint_key: input.related_approval_checkpoint_key || null,
      created_at: timestamp,
      updated_at: timestamp,
    });

    const outcomes = [];

    for (const recipient_agent_id of recipients) {
      upsertMessageDeliveryFn(db, {
        message_id: message.message_id,
        recipient_agent_id,
        channel: 'opencode',
        status: 'pending',
        last_attempt_at: timestamp,
        updated_at: timestamp,
      });

      const binding = normalizeResolverOutcome(
        await Promise.resolve(
          resolveTargetBinding({
            mission_id: input.mission_id,
            recipient_agent_id,
          })
        ),
        recipient_agent_id
      );

      if (binding.status !== 'bound') {
        const delivery = upsertMessageDeliveryFn(db, {
          message_id: message.message_id,
          recipient_agent_id,
          channel: 'opencode',
          status: 'pending',
          last_error: binding.reason,
          last_attempt_at: timestamp,
          updated_at: timestamp,
        });

        outcomes.push({
          recipient_agent_id,
          status: delivery.status,
          reason: binding.reason,
          delivery_id: delivery.delivery_id,
          delivery_ref: delivery.delivery_ref || null,
          evidence_ref: delivery.evidence_ref || null,
        });
        continue;
      }

      let adapterResult;
      let adapterError = null;
      try {
        adapterResult = await sendToVerifiedSession({
          session_id: binding.session_id,
          opencode_session_id: binding.opencode_session_id,
          agent_model: binding.agent_model,
          prompt: String(input.body_summary).trim(),
          cwd: binding.cwd,
          recipient_agent_id,
          mission_id: input.mission_id,
          message_id: message.message_id,
        });
      } catch (error) {
        adapterError = error;
      }

      const mapped = mapAdapterOutcome(adapterResult, adapterError);
      assertDurableDeliveryState(mapped.status);

      const delivery = upsertMessageDeliveryFn(db, {
        message_id: message.message_id,
        recipient_agent_id,
        channel: 'opencode',
        status: mapped.status,
        delivery_ref: mapped.delivery_ref,
        evidence_ref: mapped.evidence_ref,
        last_error: mapped.last_error,
        last_attempt_at: timestamp,
        updated_at: timestamp,
      });

      outcomes.push({
        recipient_agent_id,
        status: delivery.status,
        reason: mapped.reason,
        delivery_id: delivery.delivery_id,
        delivery_ref: delivery.delivery_ref,
        evidence_ref: delivery.evidence_ref,
      });
    }

    return {
      message,
      outcomes,
    };
  };
}

module.exports = {
  createTeamTell,
};
