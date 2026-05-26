'use strict';

const mockGet = jest.fn();
jest.mock('../lib/db', () => ({
  getDb: jest.fn(() => ({
    prepare: jest.fn(() => ({
      get: mockGet,
    })),
  })),
}));

jest.mock('../lib/format', () => ({
  row: (label, value) => `${label}: ${value}`,
  section: (title) => `=== ${title} ===`,
  divider: () => '---',
  isTTY: false,
}));

// Capture http.request calls
let capturedRequestOptions = null;
let capturedWriteData = null;
jest.mock('http', () => ({
  request: jest.fn((opts, callback) => {
    capturedRequestOptions = opts;
    const EventEmitter = require('events');
    const emitter = new EventEmitter();
    emitter.write = jest.fn((data) => {
      capturedWriteData = data;
    });
    emitter.end = jest.fn(() => {
      const mockRes = new EventEmitter();
      mockRes.statusCode = 200;
      callback(mockRes);
      process.nextTick(() => {
        mockRes.emit(
          'data',
          JSON.stringify({
            launch_result: {
              launchId: 'test-123',
              runtime_requests: [],
              launch_trace: {
                traceId: 'trace-test-123',
                traceType: 'swarm_launch',
                traceSessionId: 'test-123-director-session',
                requestedAt: '2026-05-26T00:00:00.000Z',
                committedAt: '2026-05-26T00:00:02.000Z',
                durationMs: 2000,
              },
            },
          })
        );
        mockRes.emit('end');
      });
    });
    return emitter;
  }),
}));

const swarmLaunchCommand = require('../commands/swarm-launch');

describe('swarm-launch CLI command', () => {
  let exitSpy;
  let stderrSpy;
  let stdoutSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
    mockGet.mockReset();
    capturedRequestOptions = null;
    capturedWriteData = null;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  test('exits with error when project not found', () => {
    mockGet.mockReturnValue(undefined);
    swarmLaunchCommand('nonexistent-project');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("error: project 'nonexistent-project' not found")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  test('calls API with correct project_id', (done) => {
    mockGet.mockReturnValue({ id: 'proj-1', name: 'Test Project' });

    swarmLaunchCommand('proj-1', { mission: 'Test mission' });

    // Wait for async callback
    setTimeout(() => {
      expect(capturedRequestOptions).toMatchObject({
        hostname: 'localhost',
        port: '3000',
        path: '/api/agenthub/operations/health',
        method: 'POST',
      });
      expect(capturedWriteData).toContain('"project_id":"proj-1"');
      expect(capturedWriteData).toContain('"action":"launch_swarm_local"');
      done();
    }, 50);
  });

  test('passes template and provider options to draft', (done) => {
    mockGet.mockReturnValue({ id: 'proj-1', name: 'Test Project' });

    swarmLaunchCommand('proj-1', {
      template: 'clean-slate',
      provider: 'github-copilot/gpt-5.4-mini',
    });

    setTimeout(() => {
      expect(capturedWriteData).toContain('"templateId":"clean-slate"');
      expect(capturedWriteData).toContain('"providerId":"github-copilot/gpt-5.4-mini"');
      done();
    }, 50);
  });
});
