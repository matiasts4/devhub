/**
 * shellIntegration.js — Shell RC snippets for terminal-engine-v2 OSC 7 cwd reporting.
 *
 * These snippets are designed to be sourced by the user's shell config (e.g.
 * ~/.bashrc, ~/.zshrc, ~/.config/fish/config.fish). They are guarded by the
 * DEVHUB_SHELL_INTEGRATION env var so they only emit OSC 7 inside DevHub-owned
 * terminals.
 */

import os from 'os';

export const SUPPORTED_SHELLS = ['bash', 'zsh', 'fish'];

/**
 * Build the OSC 7 cwd sequence for a given cwd and hostname.
 */
export function buildOsc7CwdString(cwd, hostname = os.hostname()) {
  const safeCwd = String(cwd || '');
  const safeHost = String(hostname || 'localhost');
  return `\x1b]7;file://${safeHost}${safeCwd}\x1b\\`;
}

const OSC7_PRINTF_FMT = '\x1b]7;file://%s%s\x1b\\';

function getBashSnippet() {
  const lines = [
    '# DevHub terminal-engine-v2 shell integration (bash)',
    'if [[ "$DEVHUB_SHELL_INTEGRATION" == "1" ]]; then',
    '  __devhub_emit_osc7() {',
    '    local devhub_cwd="${PWD}"',
    '    local devhub_host="${DEVHUB_OSC7_HOSTNAME:-$(hostname)}"',
    `    printf '${OSC7_PRINTF_FMT}' "$devhub_host" "$devhub_cwd"`,
    '  }',
    '  if [[ -n "$PROMPT_COMMAND" ]]; then',
    '    PROMPT_COMMAND="$PROMPT_COMMAND; __devhub_emit_osc7"',
    '  else',
    "    PROMPT_COMMAND='__devhub_emit_osc7'",
    '  fi',
    'fi',
    '',
  ];
  return lines.join('\n');
}

function getZshSnippet() {
  const lines = [
    '# DevHub terminal-engine-v2 shell integration (zsh)',
    'if [[ "$DEVHUB_SHELL_INTEGRATION" == "1" ]]; then',
    '  __devhub_emit_osc7() {',
    '    local devhub_cwd="${PWD}"',
    '    local devhub_host="${DEVHUB_OSC7_HOSTNAME:-$(hostname)}"',
    `    printf '${OSC7_PRINTF_FMT}' "$devhub_host" "$devhub_cwd"`,
    '  }',
    '  precmd_functions+=(__devhub_emit_osc7)',
    'fi',
    '',
  ];
  return lines.join('\n');
}

function getFishSnippet() {
  const lines = [
    '# DevHub terminal-engine-v2 shell integration (fish)',
    'if test "$DEVHUB_SHELL_INTEGRATION" = "1"',
    '  function __devhub_emit_osc7 --on-event fish_prompt',
    '    set -l devhub_cwd "$PWD"',
    '    set -l devhub_host (test -n "$DEVHUB_OSC7_HOSTNAME"; and echo "$DEVHUB_OSC7_HOSTNAME"; or hostname)',
    `    printf '${OSC7_PRINTF_FMT}' "$devhub_host" "$devhub_cwd"`,
    '  end',
    'end',
    '',
  ];
  return lines.join('\n');
}

/**
 * Get the shell integration RC snippet for a supported shell.
 *
 * @param {'bash'|'zsh'|'fish'} shell
 * @returns {string|null}
 */
export function getShellIntegrationSnippet(shell) {
  switch (shell) {
    case 'bash':
      return getBashSnippet();
    case 'zsh':
      return getZshSnippet();
    case 'fish':
      return getFishSnippet();
    default:
      return null;
  }
}
