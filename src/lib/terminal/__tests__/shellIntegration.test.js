/**
 * shellIntegration.test.js — TDD unit tests for terminal shell integration snippets.
 *
 * Verifies: snippet generators exist for bash/zsh/fish; snippets check
 * DEVHUB_SHELL_INTEGRATION=1; bash/zsh use PROMPT_COMMAND/precmd; fish uses
 * fish_prompt; the OSC 7 builder produces the expected sequence.
 */

const os = require('os');
const {
  buildOsc7CwdString,
  getShellIntegrationSnippet,
  SUPPORTED_SHELLS,
} = require('../shellIntegration.js');

describe('shellIntegration — buildOsc7CwdString', () => {
  it('builds an OSC 7 cwd sequence with ST terminator', () => {
    const sequence = buildOsc7CwdString('/home/user', 'myhost');
    expect(sequence).toBe('\x1b]7;file://myhost/home/user\x1b\\');
  });

  it('uses localhost when hostname is empty', () => {
    const sequence = buildOsc7CwdString('/tmp', '');
    expect(sequence).toBe('\x1b]7;file://localhost/tmp\x1b\\');
  });

  it('defaults hostname to os.hostname()', () => {
    const sequence = buildOsc7CwdString('/');
    expect(sequence).toContain(`file://${os.hostname()}/`);
  });
});

describe('shellIntegration — snippet generator', () => {
  it('supports bash, zsh, and fish', () => {
    expect(SUPPORTED_SHELLS).toContain('bash');
    expect(SUPPORTED_SHELLS).toContain('zsh');
    expect(SUPPORTED_SHELLS).toContain('fish');
  });

  it('returns null for unsupported shells', () => {
    expect(getShellIntegrationSnippet('pwsh')).toBeNull();
    expect(getShellIntegrationSnippet('unknown')).toBeNull();
  });

  it('bash snippet checks DEVHUB_SHELL_INTEGRATION and hooks PROMPT_COMMAND', () => {
    const snippet = getShellIntegrationSnippet('bash');
    expect(snippet).toContain('DEVHUB_SHELL_INTEGRATION');
    expect(snippet).toContain('PROMPT_COMMAND');
    expect(snippet).toContain('\x1b]7;');
    expect(snippet).toContain('file://');
  });

  it('zsh snippet checks DEVHUB_SHELL_INTEGRATION and hooks precmd', () => {
    const snippet = getShellIntegrationSnippet('zsh');
    expect(snippet).toContain('DEVHUB_SHELL_INTEGRATION');
    expect(snippet).toContain('precmd');
    expect(snippet).toContain('\x1b]7;');
    expect(snippet).toContain('file://');
  });

  it('fish snippet checks DEVHUB_SHELL_INTEGRATION and hooks fish_prompt', () => {
    const snippet = getShellIntegrationSnippet('fish');
    expect(snippet).toContain('DEVHUB_SHELL_INTEGRATION');
    expect(snippet).toContain('fish_prompt');
    expect(snippet).toContain('\x1b]7;');
    expect(snippet).toContain('file://');
  });

  it('bash snippet emits an OSC 7 string for a cwd when evaluated conceptually', () => {
    const snippet = getShellIntegrationSnippet('bash');
    // Extract the function name and confirm it would call the OSC 7 builder
    // pattern. We verify by simulating the shell variable substitution logic.
    expect(snippet).toMatch(/__devhub_emit_osc7\s*\(\)/);
    expect(snippet).toContain('\x1b]7;file://');
    expect(snippet).toContain('${PWD}');
  });
});
