import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlanningKickoffPrompt,
  resolveDefaultPlanningMode,
} from '../planningPrompts.js';

test('buildPlanningKickoffPrompt includes project id for initial mode', () => {
  const prompt = buildPlanningKickoffPrompt('initial', {
    projectId: 'proj-abc',
    projectName: 'Mi App',
  });

  assert.match(prompt, /proj-abc/);
  assert.match(prompt, /Mi App/);
  assert.match(prompt, /planificación completa/i);
  assert.match(prompt, /get_project_context/);
});

test('buildPlanningKickoffPrompt adapts for continuation with existing work', () => {
  const prompt = buildPlanningKickoffPrompt('continue', {
    projectId: 'proj-abc',
    hasExistingWork: true,
  });

  assert.match(prompt, /continuar la planificación/i);
  assert.match(prompt, /siguiente fase/i);
  assert.doesNotMatch(prompt, /planificación completa/i);
});

test('resolveDefaultPlanningMode picks continue when roadmap exists', () => {
  assert.equal(resolveDefaultPlanningMode({ taskCount: 3, milestoneCount: 0 }), 'continue');
  assert.equal(resolveDefaultPlanningMode({ taskCount: 0, milestoneCount: 1 }), 'continue');
  assert.equal(resolveDefaultPlanningMode({ taskCount: 0, milestoneCount: 0 }), 'initial');
});
