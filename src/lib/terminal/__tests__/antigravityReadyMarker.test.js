const fs = require('fs');
const path = require('path');

const {
  detectAntigravityReadyFromTerminalBuffer,
  detectAntigravitySessionFromOutput,
  detectAntigravityTuiReady,
  isAntigravityLaunchCommand,
  normalizeAntigravityLaunchCommand,
} = require('../antigravityReadyMarker.js');

const FIXTURE_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'tests',
  'fixtures',
  'agent-screens'
);

function readFixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

describe('antigravityReadyMarker', () => {
  test('isAntigravityLaunchCommand matches agy/antigravity launch commands', () => {
    expect(isAntigravityLaunchCommand('agy')).toBe(true);
    expect(isAntigravityLaunchCommand('antigravity --yolo')).toBe(true);
    expect(isAntigravityLaunchCommand('/home/user/.local/bin/agy')).toBe(true);
    expect(isAntigravityLaunchCommand('opencode --agent swarm-coder')).toBe(false);
    expect(isAntigravityLaunchCommand('kimi --yolo')).toBe(false);
  });

  test('normalizeAntigravityLaunchCommand strips recovery suffix', () => {
    expect(normalizeAntigravityLaunchCommand('agy #recovery-7')).toBe('agy');
    expect(normalizeAntigravityLaunchCommand('  antigravity  ')).toBe('antigravity');
  });

  test('detectAntigravityTuiReady matches the idle footer fixture', () => {
    expect(detectAntigravityTuiReady(readFixture('antigravity-idle-footer.txt'))).toBe(true);
  });

  test('detectAntigravityTuiReady matches the working footer fixture', () => {
    expect(detectAntigravityTuiReady(readFixture('antigravity-working-footer.txt'))).toBe(true);
  });

  test('detectAntigravityTuiReady matches the blocked permission fixture', () => {
    // A permission prompt is not "ready for input", but it proves the agy TUI
    // is live — pre-attached panels blocked on a prompt must still enter
    // agent detection (W1).
    expect(detectAntigravityTuiReady(readFixture('antigravity-blocked-permission.txt'))).toBe(true);
    expect(detectAntigravityTuiReady('requesting permission for:')).toBe(true);
    expect(detectAntigravityTuiReady('do you want to proceed?')).toBe(true);
  });

  test('detectAntigravityTuiReady matches individual chrome signals', () => {
    expect(detectAntigravityTuiReady('? for shortcuts')).toBe(true);
    expect(detectAntigravityTuiReady('press ? for shortcuts')).toBe(true);
    expect(detectAntigravityTuiReady('accept-edits · Gemini 3.5 Flash')).toBe(true);
    expect(detectAntigravityTuiReady('antigravity>')).toBe(true);
    expect(detectAntigravityTuiReady('  antigravity  ')).toBe(true);
    expect(detectAntigravityTuiReady('antigravity (v1.2.3)')).toBe(true);
    expect(detectAntigravityTuiReady('esc to cancel')).toBe(true);
    expect(detectAntigravityTuiReady('esc to interrupt')).toBe(true);
    expect(detectAntigravityTuiReady('ctrl+c to cancel')).toBe(true);
    expect(detectAntigravityTuiReady('\x1b]0;antigravity\x07')).toBe(true);
  });

  test('detectAntigravityTuiReady accepts the (session, text) call shape', () => {
    const session = { id: 'term-1' };
    expect(detectAntigravityTuiReady(session, '? for shortcuts')).toBe(true);
    expect(detectAntigravityTuiReady(session, 'plain shell output')).toBe(false);
  });

  test('detectAntigravityTuiReady rejects plain shell output', () => {
    expect(detectAntigravityTuiReady('booting shell')).toBe(false);
    expect(detectAntigravityTuiReady('user@host:~/repo$ ls -la')).toBe(false);
    expect(detectAntigravityTuiReady('PS C:\\Users\\PC>')).toBe(false);
    expect(detectAntigravityTuiReady('')).toBe(false);
    expect(detectAntigravityTuiReady(null)).toBe(false);
    expect(detectAntigravityTuiReady(undefined)).toBe(false);
  });

  test('detectAntigravitySessionFromOutput mirrors the tmux/pre-attach detector', () => {
    expect(detectAntigravitySessionFromOutput(readFixture('antigravity-idle-footer.txt'))).toBe(
      true
    );
    expect(detectAntigravitySessionFromOutput('\x1b]0;antigravity\x07')).toBe(true);
    expect(detectAntigravitySessionFromOutput('bash-5.2$')).toBe(false);
  });

  test('detectAntigravityReadyFromTerminalBuffer scans scrollback tail', () => {
    const term = {
      buffer: {
        active: {
          length: 2,
          getLine: (index) => ({
            translateToString: () => (index === 1 ? 'accept-edits · Gemini 3.5 Flash' : 'booting'),
          }),
        },
      },
    };
    expect(detectAntigravityReadyFromTerminalBuffer(term)).toBe(true);
    expect(detectAntigravityReadyFromTerminalBuffer(null)).toBe(false);
  });
});
