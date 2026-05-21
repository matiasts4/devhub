const fs = require('fs');
const os = require('os');
const path = require('path');

const runnerPath = path.resolve(__dirname, '../../scripts/qa/run-multi-agent-desktop.cjs');

describe('multi-agent desktop qa runner helpers', () => {
  let api;

  beforeEach(() => {
    jest.resetModules();
    api = require(runnerPath);
  });

  test('buildManifest preserves durable refs as links and marks incomplete classes explicitly', () => {
    const manifest = api.buildManifest({
      qaRunId: 'qa-20260521-001',
      scenarioId: 'approval-closure',
      platform: 'linux',
      bundleRoot: '/tmp/desktop-qa/qa-20260521-001',
      surfaces: {
        browser: {
          status: 'passed',
          results_json: '/tmp/browser/results.json',
          html_report: '/tmp/browser/report/index.html',
        },
        native: {
          status: 'passed',
          summary_json: '/tmp/native/summary.json',
        },
        headless: {
          status: 'failed',
          report_json: '/tmp/headless/report.json',
        },
      },
      durableRefs: {
        approvals: ['evidence://approval/checkpoint-1'],
        runs: ['evidence://run/run-1'],
        workspaces: [],
        recovery: [],
      },
    });

    expect(manifest).toEqual({
      qa_run_id: 'qa-20260521-001',
      scenario_id: 'approval-closure',
      platform: 'linux',
      bundle_root: '/tmp/desktop-qa/qa-20260521-001',
      surfaces: {
        browser: {
          status: 'passed',
          results_json: '/tmp/browser/results.json',
          html_report: '/tmp/browser/report/index.html',
        },
        native: {
          status: 'passed',
          summary_json: '/tmp/native/summary.json',
        },
        headless: {
          status: 'failed',
          report_json: '/tmp/headless/report.json',
        },
      },
      durable_refs: {
        approvals: ['evidence://approval/checkpoint-1'],
        runs: ['evidence://run/run-1'],
        workspaces: [],
        recovery: [],
      },
      incomplete: ['durable_refs.workspaces', 'durable_refs.recovery'],
    });
  });

  test('writeManifest normalizes output under test-results/desktop-qa and persists JSON', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-qa-runner-'));
    const manifest = api.buildManifest({
      qaRunId: 'qa-20260521-001',
      scenarioId: 'approval-closure',
      platform: 'linux',
      bundleRoot: path.join(tempDir, 'test-results', 'desktop-qa', 'qa-20260521-001'),
      surfaces: {},
      durableRefs: {},
    });

    const manifestPath = api.writeManifest({ manifest, fs });

    expect(manifestPath).toBe(
      path.join(tempDir, 'test-results', 'desktop-qa', 'qa-20260521-001', 'manifest.json')
    );
    expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))).toEqual(manifest);
  });

  test('collectHealthDurableRefs tags evidence links with the shared qa_run_id without copying payloads', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        control_room_snapshot_input: {
          supervisor: {
            approvals: [
              {
                checkpoint_key: 'checkpoint-1',
                evidence_ref: 'evidence://approval/checkpoint-1',
              },
            ],
          },
          evidence_timeline: [
            {
              kind: 'run',
              item_id: 'run-1',
              evidence_ref: 'evidence://run/run-1',
            },
            {
              kind: 'artifact',
              linked_ids: { workspace_id: 'ws-1' },
              evidence_ref: 'evidence://workspace/ws-1',
            },
          ],
        },
      }),
    }));

    const durableRefs = await api.collectHealthDurableRefs({
      baseUrl: 'http://127.0.0.1:3100',
      qaRunId: 'qa-20260521-001',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3100/api/agenthub/operations/health',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(durableRefs).toEqual({
      approvals: ['evidence://approval/checkpoint-1#qa-20260521-001'],
      runs: ['evidence://run/run-1#qa-20260521-001'],
      workspaces: ['evidence://workspace/ws-1#qa-20260521-001'],
      recovery: [],
    });
  });
});
