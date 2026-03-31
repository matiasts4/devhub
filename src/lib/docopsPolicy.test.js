import test from 'node:test';
import assert from 'node:assert/strict';
import { DOCOPS_CONTEXT_BUDGET_POLICY, getDocOpsContextBudgetPolicy } from './docopsPolicy.js';

test('shares the default DocOps context budget policy', () => {
  assert.deepEqual(getDocOpsContextBudgetPolicy(), DOCOPS_CONTEXT_BUDGET_POLICY);
});

test('supports overrides without mutating the shared defaults', () => {
  const overridden = getDocOpsContextBudgetPolicy({ max_expansions: 4 });

  assert.deepEqual(overridden, {
    max_tokens_context: 2500,
    max_expansions: 4,
    expansion_step_tokens: 1000,
  });
  assert.deepEqual(DOCOPS_CONTEXT_BUDGET_POLICY, {
    max_tokens_context: 2500,
    max_expansions: 2,
    expansion_step_tokens: 1000,
  });
});
