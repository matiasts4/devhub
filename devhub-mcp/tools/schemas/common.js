import { z } from 'zod';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LEGACY_ID_REGEX = /^[a-z]+-\d{10,}-[a-z0-9]{8}$/i;

export const UUID_OR_LEGACY_ID_SCHEMA = z
  .string()
  .refine((value) => UUID_REGEX.test(String(value)) || LEGACY_ID_REGEX.test(String(value)), {
    message: 'Debe ser UUID o ID legacy (<tipo>-<timestamp>-<suffix>)',
  });

export const PROJECT_ID_SCHEMA = z.string().uuid().describe('UUID del proyecto');
export const TASK_ID_SCHEMA = UUID_OR_LEGACY_ID_SCHEMA.describe('ID de la tarea (UUID o legacy)');
export const WORKSPACE_ID_SCHEMA = z
  .string()
  .min(1)
  .describe('ID del workspace (devhub-cloud-foundation: required for all 30 tools in cloud mode)');
export const AGENT_ID_SCHEMA = z.string().min(1).describe('ID del agente');
export const RUN_ID_SCHEMA = z.string().min(1).describe('ID del run');

// devhub-cloud-foundation: workspace role enum for membership tools.
export const WORKSPACE_ROLE_SCHEMA = z
  .enum(['owner', 'admin', 'member', 'viewer'])
  .describe('Workspace role. Default for add_member is "member".');
