const { createOpencodeTargetResolver } = require('../../../src/lib/swarm/opencodeTargetResolver');

describe('opencodeTargetResolver', () => {
  test('returns a verified bound target shaped for send', async () => {
    const getVerifiedMissionRecipientBinding = jest.fn(() => ({
      status: 'bound',
      classification: 'bound',
      agent_id: 'worker-1',
      session_id: 'session-worker-1',
      opencode_session_id: 'oc-worker-1',
      workspace_id: 'ws-worker-1',
      run_id: 'run-worker-1',
      run_id_or_session_id: 'session-worker-1',
      reason: 'binding_found',
      agent_model: 'gpt-5.4',
      cwd: '/repo/devhub',
    }));
    const resolveTargetBinding = createOpencodeTargetResolver({
      db: { marker: 'db' },
      getVerifiedMissionRecipientBinding,
    });

    const result = await resolveTargetBinding({
      mission_id: 'mission-1',
      recipient_agent_id: 'worker-1',
    });

    expect(getVerifiedMissionRecipientBinding).toHaveBeenCalledWith(
      { marker: 'db' },
      { mission_id: 'mission-1', recipient_agent_id: 'worker-1' }
    );
    expect(result).toEqual({
      status: 'bound',
      classification: 'bound',
      agent_id: 'worker-1',
      session_id: 'session-worker-1',
      opencode_session_id: 'oc-worker-1',
      workspace_id: 'ws-worker-1',
      run_id: 'run-worker-1',
      run_id_or_session_id: 'session-worker-1',
      reason: 'binding_found',
      agent_model: 'gpt-5.4',
      cwd: '/repo/devhub',
    });
  });

  test('returns unbound binding_missing without guessing runtime truth', async () => {
    const resolveTargetBinding = createOpencodeTargetResolver({
      db: {},
      getVerifiedMissionRecipientBinding: jest.fn(() => ({
        status: 'unbound',
        classification: 'missing',
        agent_id: 'worker-2',
        session_id: null,
        opencode_session_id: null,
        workspace_id: null,
        run_id: null,
        run_id_or_session_id: null,
        reason: 'binding_missing',
        agent_model: null,
        cwd: null,
      })),
    });

    const result = await resolveTargetBinding({
      mission_id: 'mission-1',
      recipient_agent_id: 'worker-2',
    });

    expect(result).toEqual({
      status: 'unbound',
      classification: 'missing',
      agent_id: 'worker-2',
      session_id: null,
      opencode_session_id: null,
      workspace_id: null,
      run_id: null,
      run_id_or_session_id: null,
      reason: 'binding_missing',
      agent_model: null,
      cwd: null,
    });
  });

  test('preserves binding_stale without inventing a bound target', async () => {
    const resolveTargetBinding = createOpencodeTargetResolver({
      db: {},
      getVerifiedMissionRecipientBinding: jest.fn(() => ({
        status: 'unbound',
        classification: 'stale',
        agent_id: 'worker-3',
        session_id: 'session-worker-3',
        opencode_session_id: null,
        workspace_id: 'ws-worker-3',
        run_id: 'run-worker-3',
        run_id_or_session_id: 'session-worker-3',
        reason: 'binding_stale',
        agent_model: null,
        cwd: null,
      })),
    });

    const result = await resolveTargetBinding({
      mission_id: 'mission-1',
      recipient_agent_id: 'worker-3',
    });

    expect(result).toEqual({
      status: 'unbound',
      classification: 'stale',
      agent_id: 'worker-3',
      session_id: 'session-worker-3',
      opencode_session_id: null,
      workspace_id: 'ws-worker-3',
      run_id: 'run-worker-3',
      run_id_or_session_id: 'session-worker-3',
      reason: 'binding_stale',
      agent_model: null,
      cwd: null,
    });
  });

  test('preserves binding_orphaned classification and durable run_id without inventing bound state', async () => {
    const resolveTargetBinding = createOpencodeTargetResolver({
      db: {},
      getVerifiedMissionRecipientBinding: jest.fn(() => ({
        status: 'unbound',
        classification: 'orphaned',
        agent_id: 'worker-4',
        session_id: 'runtime-session-worker-4',
        opencode_session_id: null,
        workspace_id: 'ws-worker-4',
        run_id: 'run-worker-4',
        run_id_or_session_id: 'runtime-session-worker-4',
        reason: 'binding_orphaned',
        agent_model: null,
        cwd: '/repo/devhub',
      })),
    });

    const result = await resolveTargetBinding({
      mission_id: 'mission-1',
      recipient_agent_id: 'worker-4',
    });

    expect(result).toEqual({
      status: 'unbound',
      classification: 'orphaned',
      agent_id: 'worker-4',
      session_id: 'runtime-session-worker-4',
      opencode_session_id: null,
      workspace_id: 'ws-worker-4',
      run_id: 'run-worker-4',
      run_id_or_session_id: 'runtime-session-worker-4',
      reason: 'binding_orphaned',
      agent_model: null,
      cwd: '/repo/devhub',
    });
  });
});
