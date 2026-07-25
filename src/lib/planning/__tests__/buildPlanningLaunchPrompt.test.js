import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanningLaunchPrompt } from '../buildPlanningLaunchPrompt.js';

const UUID = '11111111-1111-4111-8111-111111111111';

const baseOpts = {
  projectId: UUID,
  projectName: 'Demo Project',
  documentationPolicy: 'shared',
  hasExistingWork: false,
};

test('buildPlanningLaunchPrompt: first line is the [DevHub Planning Agent] envelope', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.ok(
    prompt.startsWith('[DevHub Planning Agent]'),
    `expected prompt to start with envelope, got: ${prompt.slice(0, 80)}`
  );
});

test('buildPlanningLaunchPrompt: contains project_id with the provided UUID', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.match(prompt, new RegExp(`project_id: ['"\`]?${UUID}['"\`]?`));
});

test('buildPlanningLaunchPrompt: contains documentation_policy when provided', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.match(prompt, new RegExp(`documentation_policy: ['"\`]?shared['"\`]?`));
});

test('buildPlanningLaunchPrompt: omits documentation_policy line when not provided', () => {
  const prompt = buildPlanningLaunchPrompt({
    mode: 'initial',
    projectId: UUID,
    projectName: 'Demo',
  });
  assert.doesNotMatch(prompt, /documentation_policy/);
});

test('buildPlanningLaunchPrompt: contains the mandatory get_project_context call with the project id', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.match(prompt, /get_project_context/);
  assert.match(
    prompt,
    new RegExp(`get_project_context[^{]*\\{[^}]*project_id[^}]*["']${UUID}["']`)
  );
});

test('buildPlanningLaunchPrompt: contains the bulk_create step (milestones + tasks)', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.match(prompt, /bulk_create_milestones/);
  assert.match(prompt, /bulk_create_tasks/);
});

test('buildPlanningLaunchPrompt: closes via update_project with planning_status: completed', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.match(prompt, /update_project/);
  // Accepts either quoted or unquoted form of the planning_status value.
  assert.match(prompt, /planning_status:\s*["']completed["']/);
});

test('buildPlanningLaunchPrompt: does NOT contain the forbidden DocOps tokens (no validate_topic_key, build_context_pack, /sdd-new)', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.doesNotMatch(prompt, /validate_topic_key/);
  assert.doesNotMatch(prompt, /build_context_pack/);
  assert.doesNotMatch(prompt, /\/sdd-new/);
});

test('buildPlanningLaunchPrompt: does NOT contain update_task (close is project-only)', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.doesNotMatch(prompt, /update_task/);
});

test('buildPlanningLaunchPrompt: contains a non-DocOps guard (warns against using the DocOps gate)', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  // Guard must mention DocOps semantically without using the forbidden token.
  assert.match(prompt, /NO uses el gate DocOps/i);
  assert.match(prompt, /NO uses.*helpers de validación|helpers.*empaquetado/i);
});

test('buildPlanningLaunchPrompt: contains the "NO abras un change SDD salvo que el usuario lo pida" guard', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  assert.match(prompt, /NO abras un change SDD/i);
  assert.match(prompt, /salvo que el usuario lo pida/i);
});

test('buildPlanningLaunchPrompt: continue mode (hasExistingWork=true) differs from initial mode', () => {
  const initial = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'initial' });
  const cont = buildPlanningLaunchPrompt({
    ...baseOpts,
    mode: 'continue',
    hasExistingWork: true,
  });

  // Shared envelope, MCP sequence, and close.
  for (const token of [
    '[DevHub Planning Agent]',
    'get_project_context',
    'bulk_create',
    'planning_status',
  ]) {
    assert.match(cont, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  // Kickoff body must differentiate the modes.
  assert.match(cont, /continuar la planificación/i);
  assert.doesNotMatch(initial, /continuar la planificación/i);
  assert.match(initial, /planificación completa/i);
});

test('buildPlanningLaunchPrompt: replan mode closes via update_project (not update_task) and has no forbidden tokens', () => {
  const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode: 'replan' });
  assert.match(prompt, /replanificar/i);
  assert.match(prompt, /update_project/);
  assert.match(prompt, /planning_status:\s*["']completed["']/);
  assert.doesNotMatch(prompt, /update_task/);
  assert.doesNotMatch(prompt, /validate_topic_key/);
  assert.doesNotMatch(prompt, /build_context_pack/);
  assert.doesNotMatch(prompt, /\/sdd-new/);
});

test('buildPlanningLaunchPrompt: all three modes produce a non-empty envelope with the mandatory tokens', () => {
  for (const mode of ['initial', 'continue', 'replan']) {
    const prompt = buildPlanningLaunchPrompt({ ...baseOpts, mode });
    assert.ok(prompt.length > 0, `mode=${mode} produced empty prompt`);
    assert.ok(prompt.startsWith('[DevHub Planning Agent]'), `mode=${mode} missing envelope`);
    assert.match(prompt, /get_project_context/);
    assert.match(prompt, /bulk_create/);
    assert.match(prompt, /update_project/);
    assert.match(prompt, /planning_status:\s*["']completed["']/);
  }
});
