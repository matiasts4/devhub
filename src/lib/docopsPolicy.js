export const DOCOPS_CONTEXT_BUDGET_POLICY = Object.freeze({
  max_tokens_context: 2500,
  max_expansions: 2,
  expansion_step_tokens: 1000,
});

export function getDocOpsContextBudgetPolicy(overrides = {}) {
  return {
    ...DOCOPS_CONTEXT_BUDGET_POLICY,
    ...overrides,
  };
}
