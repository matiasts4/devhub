const {
  classifyZedTerminalCommand,
  evaluateZedCommandExecution,
  normalizeZedTerminalCommand,
} = require('../zedCommandPolicy');

describe('zedCommandPolicy', () => {
  test('normalizeZedTerminalCommand keeps first line only', () => {
    expect(normalizeZedTerminalCommand('npm run dev\n')).toBe('npm run dev');
    expect(normalizeZedTerminalCommand('ls ; rm -rf /')).toBe('ls');
  });

  test('blocks destructive commands', () => {
    expect(classifyZedTerminalCommand('rm -rf node_modules').tier).toBe('blocked');
    expect(classifyZedTerminalCommand('git reset --hard HEAD').tier).toBe('blocked');
    expect(classifyZedTerminalCommand('sudo apt install foo').tier).toBe('blocked');
  });

  test('auto-allows common dev commands', () => {
    expect(classifyZedTerminalCommand('npm run dev').tier).toBe('allowed');
    expect(classifyZedTerminalCommand('ls -la').tier).toBe('allowed');
    expect(classifyZedTerminalCommand('git status').tier).toBe('allowed');
  });

  test('unknown commands require approval', () => {
    expect(classifyZedTerminalCommand('npm install left-pad').tier).toBe('approval_required');
    expect(classifyZedTerminalCommand('./scripts/deploy.sh').tier).toBe('approval_required');
  });

  test('evaluateZedCommandExecution dry-run until confirm', () => {
    const context = {};
    const first = evaluateZedCommandExecution({
      command: 'npm install foo',
      confirm: false,
      context,
    });
    expect(first.error).toBe('command_requires_approval');
    expect(first.action).toBe('would_execute');

    const second = evaluateZedCommandExecution({
      command: 'npm install foo',
      confirm: false,
      context,
    });
    expect(second.insist_count).toBe(2);
    expect(second.hint).toMatch(/asked again/i);

    const approved = evaluateZedCommandExecution({
      command: 'npm install foo',
      confirm: true,
      context,
    });
    expect(approved.allowed).toBe(true);
    expect(approved.approved).toBe(true);
  });

  test('blocked commands never pass even with confirm', () => {
    const result = evaluateZedCommandExecution({
      command: 'rm -rf /tmp/x',
      confirm: true,
      context: {},
    });
    expect(result.error).toBe('command_blocked');
    expect(result.allowed).toBe(false);
  });
});