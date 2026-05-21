const {
  buildSubagentOperationalFeedback,
  emitSubagentOperationalFeedback,
} = require('../../src/lib/operations/agenthubFeedback');

describe('agenthub operational feedback', () => {
  test('builds a canonical failed event and injection message from subagent execution data', () => {
    const result = buildSubagentOperationalFeedback({
      projectId: 'project-1',
      agentName: 'claude',
      status: 'error',
      sessionID: 'session-1',
      childSessionId: 'child-1',
      messageId: 'msg-1',
      errorMessage: 'Tool crashed',
      traces: [
        { type: 'tool', toolStatus: 'completed', toolName: 'bash' },
        { type: 'tool', toolStatus: 'error', toolName: 'grep' },
      ],
      textOutput: 'Failure details',
    });

    expect(result.event).toMatchObject({
      event_type: 'subagent.failed',
      source_authority: 'authoritative',
      dedupe_key: 'agenthub:subagent.failed:session-1:claude:msg-1',
    });
    expect(result.event.body).toContain('Tool crashed');
    expect(result.injectionMessage).toContain('finalizó con errores');
  });

  test('builds a completion event that still requests desktop and in-app delivery', () => {
    const result = buildSubagentOperationalFeedback({
      projectId: 'project-1',
      agentName: 'gpt-4',
      status: 'success',
      sessionID: 'session-9',
      messageId: 'msg-9',
      traces: [],
      textOutput: 'Done',
    });

    expect(result.event).toMatchObject({
      event_type: 'subagent.completed',
      delivery: { desktop: true, in_app: true },
    });
    expect(result.injectionMessage).toContain('ha finalizado su ejecución');
  });

  test('dispatches canonical feedback through notification and in-app event feed', async () => {
    const dispatchOperationalNotification = jest.fn(async (eventInput) => ({
      event: {
        ...eventInput,
        id: 'event-1',
        dedupe_key: 'agenthub:subagent.completed:session-9:gpt-4:msg-9',
        status: 'delivered',
      },
      desktop: { status: 'delivered' },
      in_app: { status: 'ready' },
    }));
    const persistOperationalEvent = jest.fn();

    const result = await emitSubagentOperationalFeedback(
      {
        projectId: 'project-1',
        agentName: 'gpt-4',
        status: 'success',
        sessionID: 'session-9',
        messageId: 'msg-9',
        traces: [],
        textOutput: 'Done',
      },
      { dispatchOperationalNotification, persistOperationalEvent }
    );

    expect(dispatchOperationalNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'subagent.completed',
        metadata: expect.objectContaining({ project_id: 'project-1' }),
      })
    );
    expect(persistOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'event-1', status: 'delivered' }),
      expect.objectContaining({ dispatch: true })
    );
    expect(result.injectionMessage).toContain('ha finalizado su ejecución');
  });

  test('keeps canonical event identity in-app when desktop delivery falls back', async () => {
    const dispatchOperationalNotification = jest.fn(async (eventInput) => ({
      event: {
        ...eventInput,
        id: 'event-2',
        dedupe_key: 'agenthub:subagent.failed:session-1:claude:msg-1',
        status: 'fallback',
      },
      desktop: { status: 'denied' },
      in_app: { status: 'ready' },
    }));
    const persistOperationalEvent = jest.fn();

    const result = await emitSubagentOperationalFeedback(
      {
        projectId: 'project-1',
        agentName: 'claude',
        status: 'error',
        sessionID: 'session-1',
        messageId: 'msg-1',
        errorMessage: 'Tool crashed',
        traces: [],
      },
      { dispatchOperationalNotification, persistOperationalEvent }
    );

    expect(persistOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupe_key: 'agenthub:subagent.failed:session-1:claude:msg-1',
        status: 'fallback',
      }),
      expect.objectContaining({ dispatch: true })
    );
    expect(result.notification.event.status).toBe('fallback');
    expect(result.injectionMessage).toContain('finalizó con errores');
  });
});
