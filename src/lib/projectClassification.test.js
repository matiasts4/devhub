import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_USER_ID } from './constants/local.js';
import {
  DEFAULT_DOCUMENTATION_POLICY,
  DEFAULT_PROJECT_TYPE,
  DOCUMENTATION_POLICY_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  buildProjectCreatePayload,
  buildProjectUpdatePayload,
  normalizeProjectClassification,
} from './projectClassification.js';

test('exposes the shared project classification options', () => {
  assert.deepEqual(
    PROJECT_TYPE_OPTIONS.map((option) => option.value),
    ['software', 'university', 'research', 'security', 'business', 'creative']
  );

  assert.deepEqual(
    DOCUMENTATION_POLICY_OPTIONS.map((option) => option.value),
    ['personal', 'shared_legacy', 'archive_only']
  );
});

test('normalizes missing project classification fields to safe defaults', () => {
  assert.deepEqual(normalizeProjectClassification({}), {
    project_type: DEFAULT_PROJECT_TYPE,
    planning_prompt: '',
    documentation_policy: DEFAULT_DOCUMENTATION_POLICY,
  });
});

test('preserves explicit project classification selections', () => {
  assert.deepEqual(
    normalizeProjectClassification({
      project_type: 'research',
      planning_prompt: 'Build the research plan',
      documentation_policy: 'archive_only',
    }),
    {
      project_type: 'research',
      planning_prompt: 'Build the research plan',
      documentation_policy: 'archive_only',
    }
  );
});

test('builds a project creation payload with classification fields', () => {
  const payload = buildProjectCreatePayload(
    {
      name: 'Project One',
      description: 'Desc',
      color: '#58A6FF',
      local_path: '/work/project-one',
      planning_prompt: 'Plan it',
      project_type: 'security',
      documentation_policy: 'shared_legacy',
    },
    LOCAL_USER_ID
  );

  assert.equal(typeof payload.id, 'string');
  assert.match(payload.id, /^[0-9a-f-]{36}$/i);

  assert.deepEqual(payload, {
    id: payload.id,
    user_id: LOCAL_USER_ID,
    name: 'Project One',
    description: 'Desc',
    color: '#58A6FF',
    local_path: '/work/project-one',
    planning_prompt: 'Plan it',
    project_type: 'security',
    documentation_policy: 'shared_legacy',
  });
});

test('builds a project update payload with classification fields', () => {
  assert.deepEqual(
    buildProjectUpdatePayload({
      name: 'New name',
      description: 'New desc',
      color: '#3FB950',
      status: 'paused',
      local_path: '/work/project-two',
      planning_prompt: 'New plan',
      project_type: 'creative',
      documentation_policy: 'archive_only',
    }),
    {
      name: 'New name',
      description: 'New desc',
      color: '#3FB950',
      status: 'paused',
      local_path: '/work/project-two',
      planning_prompt: 'New plan',
      project_type: 'creative',
      documentation_policy: 'archive_only',
    }
  );
});
