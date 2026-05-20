/* global require, module */
const { getVerifiedMissionRecipientBinding } = require('../db/localDb');

function normalizeBinding(binding = {}, recipientAgentId) {
  return {
    status: binding.status === 'bound' ? 'bound' : 'unbound',
    classification: binding.classification || (binding.status === 'bound' ? 'bound' : 'missing'),
    agent_id: binding.agent_id || recipientAgentId,
    session_id: binding.session_id || null,
    opencode_session_id: binding.status === 'bound' ? binding.opencode_session_id || null : null,
    workspace_id: binding.workspace_id || null,
    run_id: binding.run_id || null,
    run_id_or_session_id: binding.run_id_or_session_id || null,
    reason: binding.reason || 'binding_missing',
    agent_model: binding.agent_model || null,
    cwd: binding.cwd || null,
  };
}

function createOpencodeTargetResolver({
  db,
  getVerifiedMissionRecipientBindingFn = getVerifiedMissionRecipientBinding,
  getVerifiedMissionRecipientBinding: injectedLookup,
} = {}) {
  const lookup = injectedLookup || getVerifiedMissionRecipientBindingFn;

  if (!db) throw new Error('db es requerido para opencodeTargetResolver.');
  if (typeof lookup !== 'function') {
    throw new Error('getVerifiedMissionRecipientBinding es requerido para opencodeTargetResolver.');
  }

  return async function resolveTargetBinding(input = {}) {
    if (!input.mission_id) throw new Error('mission_id es requerido para opencodeTargetResolver.');
    if (!input.recipient_agent_id) {
      throw new Error('recipient_agent_id es requerido para opencodeTargetResolver.');
    }

    const binding = await Promise.resolve(
      lookup(db, {
        mission_id: input.mission_id,
        recipient_agent_id: input.recipient_agent_id,
      })
    );

    return normalizeBinding(binding, input.recipient_agent_id);
  };
}

module.exports = {
  createOpencodeTargetResolver,
};
