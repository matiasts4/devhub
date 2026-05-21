'use client';

import { ATTRS } from '@emergentbase/visual-edits';
import { buildAgentLaunchCommand } from '@/lib/agentLaunchCommand';

export const BRIDGE_AGENT_OPTIONS = [
  {
    id: 'hermes',
    label: 'Hermes',
    enabled: true,
    availabilityLabel: 'Disponible',
  },
  {
    id: 'codex',
    label: 'Codex',
    enabled: true,
    availabilityLabel: 'Disponible',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    enabled: true,
    availabilityLabel: 'Disponible',
  },
];

const AGENT_MAP = Object.fromEntries(BRIDGE_AGENT_OPTIONS.map((agent) => [agent.id, agent]));

function normalizeClassName(className = '') {
  return String(className || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('.');
}

export function deriveSelectionLabel(elementInfo = {}) {
  const tagName = String(elementInfo?.tagName || elementInfo?.element?.tagName || 'div').toLowerCase();
  const className = normalizeClassName(elementInfo?.className || elementInfo?.element?.className || '');
  const attributes = elementInfo?.attributes || elementInfo?.element?.attributes || {};
  const id = String(elementInfo?.id || elementInfo?.element?.id || attributes.id || '').trim();
  const baseLabel = id ? `${tagName}#${id}` : tagName;
  return className ? `${baseLabel}.${className}` : baseLabel;
}

export function deriveElementDimensions(elementInfo = {}) {
  const rect = elementInfo?.rect || elementInfo?.position || {};
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return `${Math.round(width)}×${Math.round(height)}`;
}

export function deriveSourceHint(elementInfo = {}) {
  const attributes = elementInfo?.attributes || {};
  const sourceParts = [
    attributes[ATTRS.FILE_NAME],
    attributes[ATTRS.SOURCE_FILE],
    attributes[ATTRS.SOURCE_PATH],
    attributes[ATTRS.SOURCE_FILE_ABS],
    attributes[ATTRS.COMPONENT],
  ].filter(Boolean);

  const lineNumber = attributes[ATTRS.LINE_NUMBER] || attributes[ATTRS.SOURCE_LINE] || null;
  if (!sourceParts.length) return null;
  const hint = sourceParts[0];
  return lineNumber ? `${hint}:${lineNumber}` : hint;
}

export function buildBridgePrompt({ browserUrl, selectedElement, changeRequest }) {
  const selectionLabel = deriveSelectionLabel(selectedElement);
  const dimensions = deriveElementDimensions(selectedElement);
  const sourceHint = deriveSourceHint(selectedElement);
  const rect = selectedElement?.rect || selectedElement?.position || {};
  const extraContext = [
    sourceHint ? `- Source hint: ${sourceHint}` : null,
    dimensions ? `- Approx size: ${dimensions}` : null,
    Number.isFinite(Number(rect?.x)) && Number.isFinite(Number(rect?.y))
      ? `- Approx position: x=${Math.round(Number(rect.x))}, y=${Math.round(Number(rect.y))}`
      : null,
  ].filter(Boolean);

  return [
    'Trabajá sobre un pedido originado desde el modo de edición visual de DevHub.',
    'Objetivo: implementar un cambio acotado al elemento visual seleccionado o a su contenedor inmediato cuando haga falta.',
    '',
    `Preview URL: ${browserUrl || 'desconocida'}`,
    `Elemento seleccionado: ${selectionLabel}`,
    ...extraContext,
    '',
    'Cambio pedido por el usuario:',
    changeRequest,
    '',
    'Restricciones:',
    '- Mantené el alcance chico y explícito.',
    '- Si necesitás ampliar el cambio, explicalo antes de hacerlo.',
    '- Seguí AGENTS.md, openspec y las convenciones locales del repo.',
    '- Verificá con tests o evidencia concreta antes de afirmar que quedó resuelto.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildAgentCommand(agentId, prompt) {
  return buildAgentLaunchCommand(agentId, prompt, { opencodeAgent: 'sdd-orchestrator' });
}

export function buildBridgeAgentRequest({
  browserUrl,
  selectedElement,
  changeRequest,
  agentId = 'hermes',
}) {
  const agent = AGENT_MAP[agentId];
  if (!agent || !agent.enabled) {
    throw new Error(`Bridge agent '${agentId}' is not enabled in this MVP.`);
  }

  const prompt = buildBridgePrompt({ browserUrl, selectedElement, changeRequest });
  const selectionLabel = deriveSelectionLabel(selectedElement);
  const taskId = `bridge-${Date.now()}`;
  const taskTitle = `Visual Edit: ${selectionLabel}`;
  const promptSummary = `${selectionLabel} — ${String(changeRequest || '').trim()}`;

  return {
    taskId,
    taskTitle,
    promptSummary,
    selectedAgent: agent.id,
    launchOrigin: 'visual-edit-pane',
    command: buildAgentCommand(agent.id, prompt),
    bridgeRequest: {
      browserUrl,
      changeRequest,
      selectedElement,
      selectionLabel,
    },
  };
}
