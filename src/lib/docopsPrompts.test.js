const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDocOpsGateLanguage,
  buildDocOpsGatePrompt,
  buildDocumentationPolicyMetadata,
  buildDocumentationPolicySummary,
  enforceDocOpsGateOnLaunchCommand,
} = require('./docopsPrompts.js');

test('DocOps gate language includes the shared budget policy', () => {
  const language = buildDocOpsGateLanguage();

  assert.match(language, /max_tokens_context: 2500/);
  assert.match(language, /max_expansions: 2/);
  assert.match(language, /expansion_step_tokens: 1000/);
  assert.match(language, /personal \/ DevHub/);
  assert.match(language, /shared_legacy/);
  assert.match(language, /archive_only/);
  assert.match(language, /preguntale al usuario antes de seguir/i);
});

test('DocOps policy helpers render canonical summaries and clarification fallback', () => {
  assert.equal(
    buildDocumentationPolicySummary('personal'),
    'personal / DevHub: aplicá el flujo DevHub de documentación y planning.'
  );
  assert.equal(
    buildDocumentationPolicySummary('shared_legacy'),
    'shared_legacy / compartida legacy: preservá la documentación legacy y no la transformes por defecto.'
  );
  assert.equal(
    buildDocumentationPolicySummary('archive_only'),
    'archive_only / solo archivo: archivá primero la documentación legacy y después creá docs DevHub nuevas.'
  );
  assert.match(buildDocumentationPolicySummary('unknown'), /preguntale al usuario/i);

  assert.equal(
    buildDocumentationPolicyMetadata('shared_legacy').requires_user_clarification,
    false
  );
  assert.equal(buildDocumentationPolicyMetadata('archive_only').mode, 'archive-first');
  assert.equal(buildDocumentationPolicyMetadata('unknown').requires_user_clarification, true);
});

test('DocOps gate prompt can carry documentation policy guidance', () => {
  const prompt = buildDocOpsGatePrompt({
    agentId: 'agent-1',
    projectId: 'project-1',
    documentationPolicy: 'archive_only',
  });

  assert.match(prompt, /policy_metadata/i);
  assert.match(prompt, /archive_only/);
  assert.match(prompt, /archivá primero/);
  assert.match(prompt, /policy_constraints/i);
  assert.match(prompt, /Luego crear documentación nueva en formato DevHub/i);
});

test('Orchestrator launch prompts carry the selected documentation policy', () => {
  const prompt = buildDocOpsGatePrompt({
    agentId: 'agent-1',
    projectId: 'project-1',
    documentationPolicy: 'shared_legacy',
  });

  assert.match(prompt, /shared_legacy/);
  assert.match(prompt, /policy_metadata/);
});

test('missing documentation policy forces clarification before proceeding', () => {
  const prompt = buildDocOpsGatePrompt({
    agentId: 'agent-1',
    projectId: 'project-1',
  });

  assert.match(prompt, /documentation_policy: missing/);
  assert.match(prompt, /preguntale al usuario antes de proceder/i);
  assert.match(prompt, /policy desconocida/i);
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

test('wrapped swarm launch scripts are left intact', () => {
  const command = `#!/usr/bin/env bash
cd "/tmp/worktree"
tmux new-session -A -d -s 'devhub-swarm-1-coder' 'opencode --agent sdd-orchestrator --prompt "You are executing SDD change **x** as **coder** in phase **sdd-apply**.\nMission ID: m1\nSession ID: s1" --model minimax' 2>/dev/null || true; tmux attach-session -t 'devhub-swarm-1-coder'`;

  assert.equal(enforceDocOpsGateOnLaunchCommand(command), command);
});
