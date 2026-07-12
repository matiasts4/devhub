/**
 * @jest-environment node
 */

const { execSync } = require('child_process');

jest.mock('child_process', () => ({
  execSync: jest.fn(),
}));

// Re-require after mock
const { getOpenCodeProcesses, __test__ } = require('../openCodeProcesses');

describe('openCodeProcesses', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    execSync.mockReset();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('parseAgentFields extracts launch id and kimi agent', () => {
    const fields = __test__.parseAgentFields(
      String.raw`C:\Users\PC\.kimi-code\bin\kimi.exe --yolo --model m launch-51a652fd-zed`
    );
    expect(fields.agent).toBe('kimi');
    expect(fields.launchId).toBe('launch-51a652fd');
  });

  test('Windows path does not call ps aux', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    execSync.mockReturnValue(
      JSON.stringify([
        {
          pid: 4242,
          name: 'kimi.exe',
          command:
            'C:\\Users\\PC\\.kimi-code\\bin\\kimi.exe --yolo --model MiniMax launch-abc12345-zed',
        },
      ])
    );

    const processes = getOpenCodeProcesses();
    expect(execSync).toHaveBeenCalled();
    const cmd = execSync.mock.calls[0][0];
    expect(cmd).toMatch(/powershell/i);
    expect(cmd).not.toMatch(/\bps aux\b/);
    expect(processes).toHaveLength(1);
    expect(processes[0].pid).toBe(4242);
    expect(processes[0].agent).toBe('kimi');
    expect(processes[0].launchId).toBe('launch-abc12345');
  });

  test('Windows empty output returns [] without throwing', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    execSync.mockReturnValue('');
    expect(getOpenCodeProcesses()).toEqual([]);
  });

  test('Unix missing processes (exit 1) returns []', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const err = new Error('Command failed: ps aux | grep ...');
    err.status = 1;
    execSync.mockImplementation(() => {
      throw err;
    });
    expect(getOpenCodeProcesses()).toEqual([]);
  });
});
