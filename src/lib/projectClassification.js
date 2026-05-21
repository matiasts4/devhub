export const DEFAULT_PROJECT_TYPE = 'software';
export const DEFAULT_DOCUMENTATION_POLICY = 'personal';

export const PROJECT_TYPE_OPTIONS = [
  { value: 'software', label: 'Software' },
  { value: 'university', label: 'Universidad' },
  { value: 'research', label: 'Investigación' },
  { value: 'security', label: 'Seguridad' },
  { value: 'business', label: 'Negocio' },
  { value: 'creative', label: 'Creativo' },
];

export const DOCUMENTATION_POLICY_OPTIONS = [
  {
    value: 'personal',
    label: 'Personal / DevHub',
    description: 'Planificá para este proyecto con documentación privada y contexto local.',
  },
  {
    value: 'shared_legacy',
    label: 'Compartida / Legacy',
    description: 'Mantené la documentación lista para reutilizarse o migrar con menos fricción.',
  },
  {
    value: 'archive_only',
    label: 'Solo archivo',
    description: 'Generá documentación mínima, enfocada en archivo y referencia histórica.',
  },
];

export function normalizeProjectClassification(input = {}) {
  const projectType = PROJECT_TYPE_OPTIONS.some((option) => option.value === input.project_type)
    ? input.project_type
    : DEFAULT_PROJECT_TYPE;

  const documentationPolicy = DOCUMENTATION_POLICY_OPTIONS.some(
    (option) => option.value === input.documentation_policy
  )
    ? input.documentation_policy
    : DEFAULT_DOCUMENTATION_POLICY;

  return {
    project_type: projectType,
    planning_prompt: input.planning_prompt || '',
    documentation_policy: documentationPolicy,
  };
}

export function buildProjectCreatePayload(input, userId) {
  const classification = normalizeProjectClassification(input);

  return {
    id: crypto.randomUUID(),
    user_id: userId,
    name: input.name,
    description: input.description,
    color: input.color,
    local_path: input.local_path,
    planning_prompt: classification.planning_prompt,
    project_type: classification.project_type,
    documentation_policy: classification.documentation_policy,
  };
}

export function buildProjectUpdatePayload(input) {
  const classification = normalizeProjectClassification(input);

  return {
    name: input.name,
    description: input.description,
    color: input.color,
    status: input.status,
    local_path: input.local_path,
    planning_prompt: classification.planning_prompt,
    project_type: classification.project_type,
    documentation_policy: classification.documentation_policy,
  };
}
