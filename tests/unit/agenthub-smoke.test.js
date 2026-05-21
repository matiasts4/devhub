const path = require('path');

const smokePath = path.resolve(__dirname, '../../bin/agenthub-smoke.js');

describe('agenthub smoke report helpers', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    api = require(smokePath);
  });

  test('buildQaMetadata stamps headless reports with shared run and scenario identifiers', () => {
    const metadata = api.buildQaMetadata({
      qaRunId: 'qa-20260521-001',
      scenarioId: 'approval-closure',
      durableRefs: {
        approvals: ['evidence://approval/checkpoint-1'],
        runs: ['evidence://run/run-1'],
        workspaces: ['evidence://workspace/ws-1'],
        recovery: [],
      },
    });

    expect(metadata).toEqual({
      qa_run_id: 'qa-20260521-001',
      scenario_id: 'approval-closure',
      durable_refs: {
        approvals: ['evidence://approval/checkpoint-1'],
        runs: ['evidence://run/run-1'],
        workspaces: ['evidence://workspace/ws-1'],
        recovery: [],
      },
      incomplete: ['durable_refs.recovery'],
    });
  });
});
