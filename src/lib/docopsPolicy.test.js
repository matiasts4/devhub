import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCOPS_CONTEXT_BUDGET_POLICY,
  buildDocumentationPolicySummary,
  buildPolicyConstraints,
  buildProjectDocumentationPolicyContext,
  getDocOpsContextBudgetPolicy,
} from './docopsPolicy.js';

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

test('builds project documentation policy context with normalized policy and summary', () => {
  const context = buildProjectDocumentationPolicyContext('shared_legacy');

  assert.deepEqual(context, {
    documentation_policy: 'shared_legacy',
    documentation_policy_summary:
      'shared_legacy / compartida legacy: preservá la documentación legacy y no la transformes por defecto.',
    documentation_policy_metadata: {
      label: 'shared_legacy / compartida legacy',
      summary: 'preservá la documentación legacy y no la transformes por defecto.',
      mode: 'legacy-preserve',
      archive_before_new_docs: false,
      preserve_legacy_by_default: true,
      requires_user_clarification: false,
    },
  });
});

test('builds clarification policy context for missing policy', () => {
  const context = buildProjectDocumentationPolicyContext(undefined);

  assert.equal(context.documentation_policy, 'unknown');
  assert.equal(context.documentation_policy_metadata.requires_user_clarification, true);
  assert.match(context.documentation_policy_summary, /preguntale al usuario/i);
});

test('buildPolicyConstraints reflects archive-only and shared legacy workflows', () => {
  assert.deepEqual(buildPolicyConstraints('shared_legacy'), [
    'Preservar la documentación legacy y no forzar el formato DevHub por defecto.',
    'No transformar ni sobrescribir los docs compartidos salvo instrucción explícita.',
  ]);

  assert.deepEqual(buildPolicyConstraints('archive_only'), [
    'Archivar primero la documentación legacy.',
    'Luego crear documentación nueva en formato DevHub.',
    'No sobrescribir los docs importados; mantener lineage y archivo.',
  ]);

  assert.match(buildPolicyConstraints('unknown').join(' '), /pedile aclaración/i);
  assert.match(buildDocumentationPolicySummary('personal'), /DevHub/);
});
