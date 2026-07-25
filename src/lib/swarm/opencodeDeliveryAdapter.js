const { sendMessage } = require('../../../telegram-bot/services/opencode');

const DURABLE_STATUSES = new Set(['sent', 'failed', 'retry_pending']);

function classifyFailure(error) {
  const message = String(error?.message || '').toLowerCase();
  if (
    message.includes('404') ||
    message.includes('session missing') ||
    message.includes('not found')
  ) {
    return 'binding_stale';
  }
  return error?.failure_class || 'transport_failed';
}

function createOpencodeDeliveryAdapter({ transportSendMessage = sendMessage } = {}) {
  if (typeof transportSendMessage !== 'function') {
    throw new Error('transportSendMessage es requerido para opencodeDeliveryAdapter.');
  }

  return async function sendToVerifiedSession(input = {}) {
    if (!input.session_id) throw new Error('session_id es requerido para opencodeDeliveryAdapter.');
    if (!input.opencode_session_id) {
      throw new Error('opencode_session_id es requerido para opencodeDeliveryAdapter.');
    }
    if (!input.agent_model)
      throw new Error('agent_model es requerido para opencodeDeliveryAdapter.');
    if (!input.prompt || !String(input.prompt).trim()) {
      throw new Error('prompt es requerido para opencodeDeliveryAdapter.');
    }

    try {
      const response = await transportSendMessage(
        input.session_id,
        input.opencode_session_id,
        input.agent_model,
        String(input.prompt).trim(),
        {
          cwd: input.cwd,
          signal: input.signal,
          onEvent: input.onEvent,
          onApproval: input.onApproval,
          chatId: input.chat_id,
        }
      );

      return {
        accepted: true,
        status: 'sent',
        delivery_ref: response?.delivery_ref || null,
        evidence_ref: response?.evidence_ref || null,
      };
    } catch (error) {
      const failure_class = classifyFailure(error);
      const status = input.retry_requested === true ? 'retry_pending' : 'failed';

      if (!DURABLE_STATUSES.has(status)) {
        throw new Error(`Estado durable inválido en opencodeDeliveryAdapter: ${status}`);
      }

      return {
        accepted: false,
        status,
        failure_class,
        retry_requested: input.retry_requested === true,
        delivery_ref: null,
        evidence_ref: null,
      };
    }
  };
}

module.exports = {
  createOpencodeDeliveryAdapter,
};
