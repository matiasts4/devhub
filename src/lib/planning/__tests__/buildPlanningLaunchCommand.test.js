import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanningLaunchCommand, UUID_V4_REGEX } from '../buildPlanningLaunchCommand.js';

const UUID = '11111111-1111-4111-8111-111111111111';

const baseOpts = {
  projectId: UUID,
  projectName: 'Demo',
  mode: 'initial',
  documentationPolicy: 'shared',
  hasExistingWork: false,
};

test('buildPlanningLaunchCommand: starts with export DEVHUB_PROJECT_ID="<uuid>"', () => {
  const cmd = buildPlanningLaunchCommand(baseOpts);
  assert.ok(
    cmd.startsWith(`export DEVHUB_PROJECT_ID="${UUID}"`),
    `expected command to start with export line, got: ${cmd.slice(0, 80)}`
  );
});

test('buildPlanningLaunchCommand: uses && to separate export from opencode invocation', () => {
  const cmd = buildPlanningLaunchCommand(baseOpts);
  assert.match(cmd, /&& opencode/);
});

test('buildPlanningLaunchCommand: invokes opencode --agent sdd-orchestrator by default', () => {
  const cmd = buildPlanningLaunchCommand(baseOpts);
  assert.match(cmd, /opencode --agent sdd-orchestrator/);
});

test('buildPlanningLaunchCommand: includes --prompt with shell-quoted body', () => {
  const cmd = buildPlanningLaunchCommand(baseOpts);
  assert.match(cmd, /--prompt /);
  // The quoted prompt must be a valid JSON string literal (shellQuotePrompt uses JSON.stringify).
  // Find the portion after --prompt and assert it parses as a JSON string.
  const match = cmd.match(/--prompt (\{.*\}|".*")$/s);
  assert.ok(match, `expected shell-quoted --prompt payload, got: ${cmd}`);
  // The quoted payload must parse as JSON (no unescaped quotes inside).
  const quoted = match[1];
  const unquoted = JSON.parse(quoted);
  assert.equal(typeof unquoted, 'string');
});

test('buildPlanningLaunchCommand: projectId appears at least twice (env value + inside prompt body)', () => {
  const cmd = buildPlanningLaunchCommand(baseOpts);
  const matches = cmd.match(new RegExp(UUID, 'g')) || [];
  assert.ok(
    matches.length >= 2,
    `expected projectId to appear at least twice, found ${matches.length} occurrences`
  );
});

test('buildPlanningLaunchCommand: accepts a custom agent (e.g. sdd-explore)', () => {
  const cmd = buildPlanningLaunchCommand({ ...baseOpts, agent: 'sdd-explore' });
  assert.match(cmd, /opencode --agent sdd-explore/);
  assert.doesNotMatch(cmd, /opencode --agent sdd-orchestrator/);
});

test('buildPlanningLaunchCommand: thrown error includes the invalid value', () => {
  assert.throws(
    () => buildPlanningLaunchCommand({ ...baseOpts, projectId: 'not-a-uuid' }),
    (err) => {
      assert.ok(err instanceof TypeError, `expected TypeError, got ${err?.constructor?.name}`);
      assert.match(err.message, /not-a-uuid/);
      return true;
    }
  );
});

test('buildPlanningLaunchCommand: throws on empty projectId', () => {
  assert.throws(
    () => buildPlanningLaunchCommand({ ...baseOpts, projectId: '' }),
    (err) => err instanceof TypeError && /projectId/.test(err.message)
  );
});

test('buildPlanningLaunchCommand: throws on undefined projectId', () => {
  assert.throws(() => buildPlanningLaunchCommand({ ...baseOpts, projectId: undefined }), TypeError);
});

test('buildPlanningLaunchCommand: throws on non-UUID v4 (UUID v1 shape)', () => {
  // This is a UUID v1 (version=1, not 4). The regex requires version=4.
  const v1 = '11111111-1111-1111-8111-111111111111';
  assert.throws(
    () => buildPlanningLaunchCommand({ ...baseOpts, projectId: v1 }),
    (err) => err instanceof TypeError && err.message.includes(v1)
  );
});

test('buildPlanningLaunchCommand: exports UUID_V4_REGEX as a RegExp', () => {
  assert.ok(UUID_V4_REGEX instanceof RegExp);
  assert.match(UUID, UUID_V4_REGEX);
  assert.doesNotMatch('not-a-uuid', UUID_V4_REGEX);
});

test('buildPlanningLaunchCommand: command does NOT include forbidden DocOps tokens', () => {
  const cmd = buildPlanningLaunchCommand(baseOpts);
  assert.doesNotMatch(cmd, /validate_topic_key/);
  assert.doesNotMatch(cmd, /build_context_pack/);
  assert.doesNotMatch(cmd, /\/sdd-new/);
});

test('buildPlanningLaunchCommand: command does NOT call enforceDocOpsGateOnLaunchCommand or buildDocOpsOrchestratorLaunchPrompt', () => {
  // The function returns only the shell command — those names should not appear at all.
  const cmd = buildPlanningLaunchCommand(baseOpts);
  assert.doesNotMatch(cmd, /enforceDocOpsGateOnLaunchCommand/);
  assert.doesNotMatch(cmd, /buildDocOpsOrchestratorLaunchPrompt/);
});

test('buildPlanningLaunchCommand: prompt payload is single-line shell-safe (no unescaped backticks/newlines)', () => {
  const cmd = buildPlanningLaunchCommand(baseOpts);
  // Extract the quoted portion and re-parse.
  const match = cmd.match(/--prompt (.+)$/s);
  assert.ok(match);
  const quoted = match[1];
  // JSON.stringify wraps the entire payload in double quotes and escapes inner backticks as \`.
  // An unescaped backtick would break out of the inner code blocks.
  const unquoted = JSON.parse(quoted);
  assert.doesNotMatch(unquoted, /[^\\]`/); // no unescaped backticks
  // No raw double quotes either.
  assert.doesNotMatch(unquoted, /[^\\]"/);
});
