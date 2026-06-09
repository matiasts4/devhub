/**
 * Zed terminal command safety policy.
 *
 * Tiers:
 * - blocked: never executed (destructive / irreversible)
 * - allowed: auto-authorized (read-only or common dev workflows)
 * - approval_required: dry-run until confirm:true (and user was asked)
 */

const BLOCKED_PATTERNS = [
  { id: 'rm-recursive', pattern: /\brm\s+.*(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i, reason: 'recursive file deletion (rm -rf)' },
  { id: 'rm-force', pattern: /\brm\s+-[a-z]*f/i, reason: 'forced file deletion (rm -f)' },
  { id: 'rm-basic', pattern: /^\s*rm\s+/i, reason: 'file deletion (rm)' },
  { id: 'rmdir', pattern: /\brmdir\b/i, reason: 'directory removal (rmdir)' },
  { id: 'unlink', pattern: /\bunlink\b/i, reason: 'file deletion (unlink)' },
  { id: 'shred', pattern: /\bshred\b/i, reason: 'secure file destruction (shred)' },
  { id: 'truncate', pattern: /\btruncate\b/i, reason: 'file truncation' },
  { id: 'dd-write', pattern: /\bdd\s+.*\bof=/i, reason: 'raw disk write (dd of=)' },
  { id: 'git-clean', pattern: /\bgit\s+clean\b/i, reason: 'git clean (removes untracked files)' },
  { id: 'git-reset-hard', pattern: /\bgit\s+reset\s+.*--hard\b/i, reason: 'git reset --hard' },
  { id: 'git-push-force', pattern: /\bgit\s+push\s+.*--force\b/i, reason: 'force push' },
  { id: 'drop-db', pattern: /\b(drop\s+database|dropdb)\b/i, reason: 'database drop' },
  { id: 'sql-drop', pattern: /\bdrop\s+table\b/i, reason: 'SQL DROP TABLE' },
  { id: 'chmod-recursive', pattern: /\bchmod\s+.*-R\b/i, reason: 'recursive chmod' },
  { id: 'chown-recursive', pattern: /\bchown\s+.*-R\b/i, reason: 'recursive chown' },
  { id: 'curl-pipe-shell', pattern: /curl\s+.*\|\s*(ba)?sh\b/i, reason: 'curl piped to shell' },
  { id: 'wget-pipe-shell', pattern: /wget\s+.*\|\s*(ba)?sh\b/i, reason: 'wget piped to shell' },
  { id: 'sudo', pattern: /^\s*sudo\s+/i, reason: 'elevated privileges (sudo)' },
  { id: 'su-root', pattern: /^\s*su\s+-/i, reason: 'switch user (su -)' },
  { id: 'kill-all', pattern: /\bkillall\b/i, reason: 'killall' },
  { id: 'pkill', pattern: /\bpkill\b/i, reason: 'pkill' },
  { id: 'kill-9', pattern: /\bkill\s+.*-9\b/i, reason: 'SIGKILL' },
  { id: 'docker-prune', pattern: /\bdocker\s+system\s+prune\b/i, reason: 'docker system prune' },
  { id: 'docker-rm-all', pattern: /\bdocker\s+rm\s+.*(-f|--force).*\$\(/i, reason: 'mass docker removal' },
  { id: 'npm-publish', pattern: /\bnpm\s+publish\b/i, reason: 'npm publish' },
  { id: 'file-overwrite-redirect', pattern: />\s*[^\s&|]+/, reason: 'shell output redirect (may overwrite files)' },
  { id: 'sed-inplace', pattern: /\bsed\s+.*-i\b/i, reason: 'in-place file edit (sed -i)' },
  { id: 'tee-overwrite', pattern: /\btee\s+[^\s|&;]+/i, reason: 'tee to file (may overwrite)' },
  { id: 'mv-overwrite', pattern: /\bmv\s+-f\b/i, reason: 'forced move/overwrite (mv -f)' },
];

const ALLOWED_PREFIXES = [
  'npm run ',
  'npm start',
  'npm test',
  'npm run',
  'yarn dev',
  'yarn start',
  'yarn test',
  'yarn run ',
  'pnpm dev',
  'pnpm start',
  'pnpm test',
  'pnpm run ',
  'npx ',
  'node ',
  'ls',
  'pwd',
  'cat ',
  'head ',
  'tail ',
  'grep ',
  'rg ',
  'find ',
  'which ',
  'whereis ',
  'echo ',
  'printenv',
  'env ',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git show',
  'git remote -v',
  'git rev-parse',
  'cargo run',
  'cargo test',
  'cargo check',
  'cargo build',
  'python ',
  'python3 ',
  'pytest',
  'go test',
  'go run',
  'go build',
  'make ',
  'jest',
  'vitest',
  'curl -I ',
  'curl --head ',
  'wget -qO- ',
  'wc ',
  'du ',
  'df ',
  'free ',
  'uptime',
  'whoami',
  'hostname',
  'date',
];

const ALLOWED_EXACT = new Set([
  'ls',
  'pwd',
  'clear',
  'whoami',
  'hostname',
  'date',
  'npm start',
  'npm test',
  'yarn dev',
  'yarn start',
  'pnpm dev',
  'pnpm start',
]);

export function normalizeZedTerminalCommand(raw) {
  if (raw === undefined || raw === null) return '';
  const text = String(raw).replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const firstLine = text.split('\n')[0].trim();
  return firstLine.replace(/[;&|]+.*$/, '').trim();
}

export function classifyZedTerminalCommand(rawCommand) {
  const command = normalizeZedTerminalCommand(rawCommand);
  if (!command) {
    return { tier: 'allowed', command: '', reason: 'empty-command' };
  }

  for (const rule of BLOCKED_PATTERNS) {
    if (rule.pattern.test(command)) {
      return {
        tier: 'blocked',
        command,
        reason: rule.reason,
        rule_id: rule.id,
      };
    }
  }

  const lower = command.toLowerCase();
  if (ALLOWED_EXACT.has(lower)) {
    return { tier: 'allowed', command, reason: 'exact-allowlist' };
  }

  for (const prefix of ALLOWED_PREFIXES) {
    if (lower === prefix.trim() || lower.startsWith(prefix)) {
      return { tier: 'allowed', command, reason: 'prefix-allowlist', matched_prefix: prefix };
    }
  }

  return { tier: 'approval_required', command, reason: 'not-in-allowlist' };
}

function trackCommandInsist(context, command) {
  if (!context || typeof context !== 'object') return 1;
  if (!context._command_insist_counts || typeof context._command_insist_counts !== 'object') {
    context._command_insist_counts = {};
  }
  const key = command;
  const next = (Number(context._command_insist_counts[key]) || 0) + 1;
  context._command_insist_counts[key] = next;
  return next;
}

export function evaluateZedCommandExecution({ command, confirm = false, context = null } = {}) {
  const classification = classifyZedTerminalCommand(command);

  if (!classification.command) {
    return { allowed: true, classification };
  }

  if (classification.tier === 'blocked') {
    return {
      allowed: false,
      error: 'command_blocked',
      command: classification.command,
      reason: classification.reason,
      rule_id: classification.rule_id || null,
      hint: 'This command is blocked for Zed (destructive or irreversible). Ask the user to run it manually in their own terminal if they really need it.',
    };
  }

  if (classification.tier === 'allowed') {
    return { allowed: true, classification };
  }

  const insistCount = trackCommandInsist(context, classification.command);

  if (confirm === true) {
    return { allowed: true, classification, approved: true, insist_count: insistCount };
  }

  return {
    allowed: false,
    error: 'command_requires_approval',
    action: 'would_execute',
    command: classification.command,
    requires_approval: true,
    insist_count: insistCount,
    hint:
      insistCount >= 2
        ? 'The user asked again — explain the risk, get explicit consent, then retry with confirm: true.'
        : 'This command is not auto-authorized. Ask the user to confirm, then retry with confirm: true.',
  };
}