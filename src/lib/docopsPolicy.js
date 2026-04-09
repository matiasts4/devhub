export const DOCOPS_CONTEXT_BUDGET_POLICY = Object.freeze({
  max_tokens_context: 2500,
  max_expansions: 2,
  expansion_step_tokens: 1000,
});

export const DOCOPS_DOCUMENTATION_POLICY_COPY = Object.freeze({
  personal: {
    label: 'personal / DevHub',
    summary: 'aplicá el flujo DevHub de documentación y planning.',
    mode: 'devhub-docs',
    archive_before_new_docs: false,
    preserve_legacy_by_default: false,
    requires_user_clarification: false,
  },
  shared_legacy: {
    label: 'shared_legacy / compartida legacy',
    summary: 'preservá la documentación legacy y no la transformes por defecto.',
    mode: 'legacy-preserve',
    archive_before_new_docs: false,
    preserve_legacy_by_default: true,
    requires_user_clarification: false,
  },
  archive_only: {
    label: 'archive_only / solo archivo',
    summary: 'archivá primero la documentación legacy y después creá docs DevHub nuevas.',
    mode: 'archive-first',
    archive_before_new_docs: true,
    preserve_legacy_by_default: true,
    requires_user_clarification: false,
  },
  unknown: {
    label: 'policy desconocida',
    summary:
      'preguntale al usuario antes de seguir porque la policy de documentación es ambigua o falta.',
    mode: 'needs-clarification',
    archive_before_new_docs: false,
    preserve_legacy_by_default: false,
    requires_user_clarification: true,
  },
});

export function getDocOpsContextBudgetPolicy(overrides = {}) {
  return {
    ...DOCOPS_CONTEXT_BUDGET_POLICY,
    ...overrides,
  };
}

export function normalizeDocumentationPolicy(policy) {
  return DOCOPS_DOCUMENTATION_POLICY_COPY[policy] ? policy : 'unknown';
}

export function getDocumentationPolicyMetadata(policy) {
  return DOCOPS_DOCUMENTATION_POLICY_COPY[normalizeDocumentationPolicy(policy)];
}

export function buildDocumentationPolicySummary(policy) {
  const metadata = getDocumentationPolicyMetadata(policy);
  return `${metadata.label}: ${metadata.summary}`;
}

export function buildProjectDocumentationPolicyContext(policy) {
  const normalized = normalizeDocumentationPolicy(policy);
  const metadata = getDocumentationPolicyMetadata(normalized);

  return {
    documentation_policy: normalized,
    documentation_policy_summary: buildDocumentationPolicySummary(normalized),
    documentation_policy_metadata: metadata,
  };
}

export function buildPolicyConstraints(policy) {
  const normalized = normalizeDocumentationPolicy(policy);
  const metadata = getDocumentationPolicyMetadata(normalized);

  if (metadata.requires_user_clarification) {
    return ['La policy es ambigua o falta; pedile aclaración al usuario antes de avanzar.'];
  }

  if (normalized === 'shared_legacy') {
    return [
      'Preservar la documentación legacy y no forzar el formato DevHub por defecto.',
      'No transformar ni sobrescribir los docs compartidos salvo instrucción explícita.',
    ];
  }

  if (normalized === 'archive_only') {
    return [
      'Archivar primero la documentación legacy.',
      'Luego crear documentación nueva en formato DevHub.',
      'No sobrescribir los docs importados; mantener lineage y archivo.',
    ];
  }

  return [
    'Aplicar el flujo DevHub de documentación y planning.',
    'Mantener el gate retrieval-first y el canonical summary.',
  ];
}
