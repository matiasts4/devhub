jest.mock('next/server', () => ({
  NextResponse: {
    json(body, init = {}) {
      return {
        status: init.status ?? 200,
        json: async () => body,
      };
    },
  },
}));

describe('POST /api/agenthub/sessions/[sessionId]/binding', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('reconciles the canonical session binding from verified runtime evidence', async () => {
    const { POST } = require('./route.js');
    const reconcileAgentRuntimeSessionBinding = jest.fn((_db, input) => ({
      status: 'reconciled',
      reason: 'binding_reconciled',
      ...input,
    }));

    const response = await POST(
      {
        json: async () => ({
          workspace_id: 'ws-1',
          run_id: 'run-1',
          opencode_session_id: 'oc-real-1',
        }),
      },
      { params: Promise.resolve({ sessionId: 'session-1' }) },
      {
        getDb: jest.fn(() => ({ fake: true })),
        reconcileAgentRuntimeSessionBinding,
      }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(reconcileAgentRuntimeSessionBinding).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        session_id: 'session-1',
        workspace_id: 'ws-1',
        run_id: 'run-1',
        opencode_session_id: 'oc-real-1',
      })
    );
    expect(payload).toEqual(
      expect.objectContaining({
        status: 'reconciled',
        reason: 'binding_reconciled',
        session_id: 'session-1',
      })
    );
  });

  test('rejects incomplete binding payloads', async () => {
    const { POST } = require('./route.js');

    const response = await POST(
      {
        json: async () => ({ run_id: 'run-1', opencode_session_id: 'oc-real-1' }),
      },
      { params: Promise.resolve({ sessionId: 'session-1' }) },
      {}
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/workspace_id/i);
  });
});
