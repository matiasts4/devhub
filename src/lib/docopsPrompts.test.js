import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocOpsGateLanguage, enforceDocOpsGateOnLaunchCommand } from './docopsPrompts.js';

test('DocOps gate language includes the shared budget policy', () => {
  const language = buildDocOpsGateLanguage();

  assert.match(language, /max_tokens_context: 2500/);
  assert.match(language, /max_expansions: 2/);
  assert.match(language, /expansion_step_tokens: 1000/);
});

test('launch commands for planning work are rewritten with the DocOps gate', () => {
  const command = 'opencode --task "Planificá la documentación DocOps"';
  const rewritten = enforceDocOpsGateOnLaunchCommand(command);

  assert.notStrictEqual(rewritten, command);
  assert.match(rewritten, /Aplicá este gate DocOps/);
  assert.match(rewritten, /validate_topic_key/);
});

test('non-DocOps launch commands are left intact', () => {
  const command = 'opencode --task "Implementar un botón"';

  assert.equal(enforceDocOpsGateOnLaunchCommand(command), command);
});
