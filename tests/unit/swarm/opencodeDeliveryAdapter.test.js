const { createOpencodeDeliveryAdapter } = require('../../../src/lib/swarm/opencodeDeliveryAdapter');

describe('opencodeDeliveryAdapter', () => {
  test('maps accepted transport responses to the durable sent path with optional refs', async () => {
    const transportSendMessage = jest.fn(async () => ({
      delivery_ref: 'delivery-ref:1',
      evidence_ref: 'evidence-ref:1',
      output: 'done',
    }));
    const sendToVerifiedSession = createOpencodeDeliveryAdapter({ transportSendMessage });

    const result = await sendToVerifiedSession({
      session_id: 'session-1',
      opencode_session_id: 'oc-1',
      agent_model: 'gpt-5.4',
      prompt: 'ship it',
      cwd: '/repo/devhub',
    });

    expect(transportSendMessage).toHaveBeenCalledWith('session-1', 'oc-1', 'gpt-5.4', 'ship it', {
      cwd: '/repo/devhub',
      signal: undefined,
      onEvent: undefined,
      onApproval: undefined,
      chatId: undefined,
    });
    expect(result).toEqual({
      accepted: true,
      status: 'sent',
      delivery_ref: 'delivery-ref:1',
      evidence_ref: 'evidence-ref:1',
    });
  });

  test('maps stale 404 transport errors to canonical durable failure', async () => {
    const transportSendMessage = jest.fn(async () => {
      throw new Error('Failed to send message to OpenCode session oc-stale: 404 session missing');
    });
    const sendToVerifiedSession = createOpencodeDeliveryAdapter({ transportSendMessage });

    const result = await sendToVerifiedSession({
      session_id: 'session-2',
      opencode_session_id: 'oc-stale',
      agent_model: 'gpt-5.4',
      prompt: 'hola',
    });

    expect(result).toEqual({
      accepted: false,
      status: 'failed',
      failure_class: 'binding_stale',
      retry_requested: false,
      delivery_ref: null,
      evidence_ref: null,
    });
  });

  test('supports explicit retry_pending while default transport failures stay failed', async () => {
    const transportSendMessage = jest
      .fn()
      .mockRejectedValueOnce(new Error('socket timeout'))
      .mockRejectedValueOnce(new Error('socket timeout'));
    const sendToVerifiedSession = createOpencodeDeliveryAdapter({ transportSendMessage });

    const failed = await sendToVerifiedSession({
      session_id: 'session-3',
      opencode_session_id: 'oc-3',
      agent_model: 'gpt-5.4',
      prompt: 'first try',
    });
    const retryPending = await sendToVerifiedSession({
      session_id: 'session-3',
      opencode_session_id: 'oc-3',
      agent_model: 'gpt-5.4',
      prompt: 'second try',
      retry_requested: true,
    });

    expect(failed).toEqual({
      accepted: false,
      status: 'failed',
      failure_class: 'transport_failed',
      retry_requested: false,
      delivery_ref: null,
      evidence_ref: null,
    });
    expect(retryPending).toEqual({
      accepted: false,
      status: 'retry_pending',
      failure_class: 'transport_failed',
      retry_requested: true,
      delivery_ref: null,
      evidence_ref: null,
    });
  });
});
