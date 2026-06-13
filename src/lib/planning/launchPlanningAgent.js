import { buildPlanningLaunchCommand } from './buildPlanningLaunchCommand.js';
import { dispatchPlanningAgentRun } from './dispatchPlanningAgentRun.js';

/**
 * Launch the planning agent for a project.
 *
 * Phase 2 + Phase 4 (planning-launch-hardening). Non-DocOps path — see
 * `openspec/changes/planning-launch-hardening/design.md` (FR-PL01..03, FR-PL06).
 *
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {{
 *   projectId: string,
 *   projectName?: string,
 *   mode?: 'initial' | 'continue' | 'replan',
 *   documentationPolicy?: string,
 *   hasExistingWork?: boolean,
 * }} opts
 * @returns {{
 *   command: string,
 *   launchOrigin: 'planning-launch',
 *   projectId: string,
 *   selectedAgent: 'sdd-orchestrator',
 *   taskId: string,
 *   promptSummary: string,
 * } | undefined}
 */
export function launchPlanningAgent(
  navigate,
  {
    projectId,
    projectName = '',
    mode = 'initial',
    documentationPolicy,
    hasExistingWork = false,
  }
) {
  if (!projectId) return undefined;

  navigate(`/project/${projectId}/terminales`);

  const command = buildPlanningLaunchCommand({
    projectId,
    projectName,
    mode,
    documentationPolicy,
    hasExistingWork,
    agent: 'sdd-orchestrator',
  });

  const detail = {
    taskId: projectId,
    command,
    selectedAgent: 'sdd-orchestrator',
    launchOrigin: 'planning-launch',
    promptSummary: `Planificación (${mode})`,
  };

  // Fase 4 — `dispatchPlanningAgentRun` is the new reliable dispatch path.
  // It emits the `devhub:run-agent` CustomEvent synchronously on the first
  // try, then retries up to MAX_ATTEMPTS=20 every RETRY_MS=100 until a
  // matching `devhub:run-agent-accepted` ack fires (or the cap is hit). The
  // ack is emitted by `handleRunAgent` in `TerminalWorkspacesManager.jsx`
  // after the panel is created. Replaces the Phase 2 synchronous placeholder
  // (and the legacy `setTimeout(150)` race). The helper reads its event
  // target off `globalThis`, so it is SSR / test safe — bare-node tests can
  // install a stub via `globalThis.window` or pass an `opts.eventTarget`.
  dispatchPlanningAgentRun(detail);

  // `projectId` is returned alongside `detail` for callers that want the audit
  // row key without having to peek at `detail.taskId` (which is intentionally
  // the same value — by design, not by coincidence).
  return { ...detail, projectId };
}

