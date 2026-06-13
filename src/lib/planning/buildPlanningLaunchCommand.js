import { shellQuotePrompt } from '@/lib/docopsPrompts';
import { buildPlanningLaunchPrompt } from './buildPlanningLaunchPrompt.js';

/**
 * UUID v4 regex (lowercase + uppercase hex, version 4 nibble, variant 8/9/a/b).
 * Exported so callers / tests can reuse the same guard.
 *
 * @type {RegExp}
 */
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Build the shell command that launches the planning agent for a given project.
 * Pure function: no I/O, no DOM. Validates `projectId` is a UUID v4 before
 * returning anything; throws on mismatch.
 *
 * Output shape:
 *   `export DEVHUB_PROJECT_ID="<projectId>" && opencode --agent <agent> --prompt <shellQuotedPrompt>`
 *
 * @param {{
 *   projectId: string,
 *   projectName?: string,
 *   mode?: 'initial' | 'continue' | 'replan',
 *   documentationPolicy?: string,
 *   hasExistingWork?: boolean,
 *   agent?: string,
 * }} opts
 * @returns {string}
 */
export function buildPlanningLaunchCommand(opts = {}) {
  const { projectId, agent = 'sdd-orchestrator' } = opts || {};

  if (typeof projectId !== 'string' || !UUID_V4_REGEX.test(projectId)) {
    throw new TypeError(
      `buildPlanningLaunchCommand: projectId is not a valid UUID: ${projectId}`
    );
  }

  const prompt = buildPlanningLaunchPrompt(opts);
  const quotedPrompt = shellQuotePrompt(prompt);

  return `export DEVHUB_PROJECT_ID="${projectId}" && opencode --agent ${agent} --prompt ${quotedPrompt}`;
}
