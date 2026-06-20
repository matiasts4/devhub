/**
 * Zed fast path — local intent router for frequent commands.
 * Skips MiniMax when confidence is high; falls back to LLM otherwise.
 */

import { resolveTerminalByName } from './zedTerminalResolver';
import { resolveNamedTerminalFromMessage } from './zedTerminalNamePhrase';
import { buildZedTerminalCatalog } from './workspaceTerminalRegistry';

const AGENT_PROGRAMS = new Set(['opencode', 'codex', 'hermes', 'kimi']);
const OPEN_VERBS = /\b(abre|abr[eía]s?|abrir|abramos|open|crea|crear|nueva|lanza|lanzar)\b/;
const CLOSE_VERBS =
  /\b(cierra|cerra|cerr[aá]|cerrar|cerralas|cerralos|cerramen|close|cierres|cierren|mata)\b/;
const TERMINAL_NOUN_RE = /\b(terminal(?:es)?|panel(?:es)?)\b/;

/**
 * @typedef {{
 *   steps: Array<{ tool: string, input: Record<string, unknown> }>,
 *   intent: string,
 *   confidence: number,
 *   matched: string,
 * }} ZedFastPathHit
 */

function normalizeText(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Normalize STT variants like "open code" → opencode */
export function normalizeAgentAliases(text) {
  return normalizeText(text)
    .replace(/\bopen\s+code\b/g, 'opencode')
    .replace(/\bopen\s+codex\b/g, 'codex')
    .replace(/\bopen\s+kimi\b/g, 'kimi')
    .replace(/\bquimy\b/g, 'kimi')
    .replace(/\bkimy\b/g, 'kimi');
}

function mergedTerminals(context) {
  return buildZedTerminalCatalog(context);
}

function hit(steps, intent, confidence, matched) {
  return { steps, intent, confidence, matched };
}

/**
 * @param {string} message
 * @param {Array<{ terminalId: string, displayName?: string }>} terminals
 * @returns {string | null | 'AMBIGUOUS'}
 */
export function extractTerminalNameFromMessage(message, terminals = []) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return null;

  let remainder = raw
    .replace(
      /^(por favor\s+)?(cierra|cerra|cerr[aá]|cerrar|cerralas|cerralos|close|cierres|cierren|mata|abr[eí]|abrir|open|lanza|lanzar|ejecuta|ejecut[aá]|run)\s+(?:(?:la|las|el|los|todas?\s+las?|todos?\s+los?)\s+)?(?:terminal(?:es)?|panel(?:es)?)\s*/i,
      ''
    )
    .replace(/\s+(por favor|please|gracias)\.?$/i, '')
    .trim();

  remainder = remainder.replace(/^(en|in|a|al)\s+/i, '').trim();

  if (!remainder) return null;

  const firstWord = remainder.split(/\s+/)[0]?.toLowerCase();
  if (firstWord && AGENT_PROGRAMS.has(firstWord)) return null;

  const candidates = [remainder, remainder.split(/\s+/)[0], remainder.split(/\s+/).pop()].filter(
    Boolean
  );

  const seen = new Set();
  for (const cand of candidates) {
    const key = cand.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const lookup = resolveTerminalByName(cand, terminals);
    if (lookup.ok) return lookup.displayName;
    if (lookup.code === 'ambiguous') return 'AMBIGUOUS';
  }
  return null;
}

/**
 * Extract multiple terminal names from close requests: "cierra Chase y Cesar".
 *
 * @param {string} message
 * @param {Array<{ terminalId: string, displayName?: string }>} terminals
 * @returns {string[] | 'AMBIGUOUS'}
 */
export function extractMultipleCloseNames(message, terminals = []) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw || !CLOSE_VERBS.test(normalizeText(raw))) return [];

  let rest = raw.replace(
    /^.*?\b(cierra|cerra|cerr[aá]|cerrar|cerralas|cerralos|close|cierres|cierren|mata)\b\s*(?:(?:la|las|el|los|todas?\s+las?|todos?\s+los?)\s+)?(?:terminales?|paneles?)?\s*/i,
    ''
  );
  rest = rest.replace(/\s+(por favor|please|gracias)\.?$/i, '').trim();
  if (!rest) return [];

  const chunks = rest
    .split(/\s+(?:y|e|and)\s+|,\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const names = [];
  for (const chunk of chunks) {
    const cleaned = chunk.replace(/^(terminal|panel)\s+/i, '').trim();
    const lookup = resolveTerminalByName(cleaned, terminals);
    if (lookup.ok) {
      if (!names.includes(lookup.displayName)) names.push(lookup.displayName);
    } else if (lookup.code === 'ambiguous') {
      return 'AMBIGUOUS';
    }
  }
  return names;
}

function extractUrl(message) {
  const raw = typeof message === 'string' ? message : '';
  const explicit = raw.match(/https?:\/\/[^\s]+/i);
  if (explicit) return explicit[0];

  const domainLike = /\b([a-z0-9][-a-z0-9.]*\.[a-z]{2,})(?:\/[^\s]*)?/i.exec(raw);
  if (domainLike) {
    const host = domainLike[1];
    if (
      /\.(com|net|org|io|dev|app|co|ai|cloud|xyz|me|es|ar|br|mx|uk|de|fr|it|nl|ru|cn|jp|kr|in|au|ca|gov|edu|mil|int|info|biz|name|pro|aero|museum|coop|jobs|mobi|travel|tel|asia|cat|post|geo|mail|xxx|onion)\b/i.test(
        host
      )
    ) {
      return `https://${domainLike[0]}`;
    }
  }
  return null;
}

function detectAgentProgram(message) {
  const norm = normalizeAgentAliases(message);
  for (const p of AGENT_PROGRAMS) {
    if (norm.includes(p)) return p;
  }
  return null;
}

const NUMBER_WORDS = {
  una: 1,
  un: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
};

function extractTerminalCount(message) {
  const lower = normalizeText(message);
  const digit = lower.match(/\b(\d+)\s+(?:terminal(?:es)?|panel(?:es)?|nuevas?|nuevos?)\b/);
  if (digit) return Math.min(parseInt(digit[1], 10), 6);
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\s+(?:terminal(?:es)?|panel(?:es)?|nuevas?|nuevos?)`).test(lower)) {
      return value;
    }
  }
  return 1;
}

/** User explicitly wants a new panel, not reuse an existing one. */
export function wantsNewTerminal(lower) {
  return (
    /\b(nueva|nuevo|otra|otro|new|another|adicional|extra|mas|más|una mas|one more)\b/.test(
      lower
    ) || /\b(una|un)\s+(terminal|panel)\b/.test(lower)
  );
}

/**
 * Resolve when user targets a named existing panel: "opencode en Chase".
 *
 * @returns {{ ok: true, displayName: string } | { code: 'ambiguous' } | null}
 */
export function resolveExplicitExistingTerminalTarget(message, terminals) {
  return resolveNamedTerminalFromMessage(message, terminals);
}

function extractAgentInTerminal(message, terminals) {
  const program = detectAgentProgram(message);
  if (!program) return null;

  const target = resolveExplicitExistingTerminalTarget(message, terminals);
  if (!target) return null;
  if (target.code === 'ambiguous') return 'AMBIGUOUS';
  return { program, name: target.displayName };
}

function isListTerminalsIntent(lower, text) {
  if (OPEN_VERBS.test(lower) || CLOSE_VERBS.test(lower)) return false;
  if (detectAgentProgram(text)) return false;

  const term = /\b(terminal(?:es|s)?|panel(?:es|s)?)\b/;

  return (
    /\b(cuant|cuánt|que|cuál|cual|list|mostr|decime|dime)\b.*\b(terminal(?:es|s)?|panel(?:es|s)?)\b.*\b(hay|abiert|activ|tengo|tenes|tienes|ahora|momento)\b/.test(
      lower
    ) ||
    (term.test(lower) && /\b(abiert|activ|hay|tengo|tenes|tienes)\b/.test(lower)) ||
    /^terminales\b.*\b(hay|abiert|activ|abier)/.test(lower) ||
    /\b(cuantas|cuántas)\s+(terminal(?:es|s)?|panel(?:es|s)?)/.test(lower)
  );
}

function isOpenTerminalIntent(lower) {
  return OPEN_VERBS.test(lower) && TERMINAL_NOUN_RE.test(lower);
}

const SETTINGS_NOUN_RE = /\b(configuracion|configuración|ajustes|preferencias|settings|opciones)\b/;
const PIZARRA_NOUN_RE = /\b(pizarra|pizarras|lienzo|tablero|draw|canvas)\b/;
const TASK_NOUN_RE = /\b(tarea|tareas|task|tasks|issue|issues)\b/;
const MILESTONE_NOUN_RE = /\b(hito|hitos|milestone|milestones|milla)\b/;
const PROJECT_NOUN_RE = /\b(proyecto|proyectos|project|projects)\b/;
const QUEUE_NOUN_RE = /\b(cola|queue|ejecucion|ejecución|fila)\b/;

function isOpenSettingsIntent(lower) {
  return OPEN_VERBS.test(lower) && SETTINGS_NOUN_RE.test(lower);
}

function isCloseSettingsIntent(lower) {
  return CLOSE_VERBS.test(lower) && SETTINGS_NOUN_RE.test(lower);
}

function isTogglePizarraIntent(lower) {
  if (!PIZARRA_NOUN_RE.test(lower)) return false;
  if (OPEN_VERBS.test(lower) || CLOSE_VERBS.test(lower)) return true;
  return /\b(muestra|mostrar|oculta|ocultar|ver|esconde|esconder|toggle|alterna|alternar)\b/.test(
    lower
  );
}

function isListProjectsIntent(lower) {
  return (
    /\b(cuales|cuáles|cuant|cuánt|que|qué|list|mostr|decime|dime|ver)\b/.test(lower) &&
    PROJECT_NOUN_RE.test(lower)
  );
}

function isListTasksIntent(lower) {
  if (OPEN_VERBS.test(lower) || CLOSE_VERBS.test(lower)) return false;
  return (
    /\b(cuales|cuáles|cuant|cuánt|que|qué|list|mostr|decime|dime|ver|tengo|tenes|tienes)\b/.test(
      lower
    ) && TASK_NOUN_RE.test(lower)
  );
}

function isGetExecutionQueueIntent(lower) {
  return (
    /\b(cuál|cual|que|qué|ver|muestra|mostr|decime|dime|list|tengo|tenes|tienes)/.test(lower) &&
    QUEUE_NOUN_RE.test(lower)
  );
}

function isCreateTaskIntent(lower) {
  return (
    /\b(crea|crear|nueva|nuevo|agrega|agregar|añade|añadir|make|create|add)\b/.test(lower) &&
    TASK_NOUN_RE.test(lower)
  );
}

function isCreateMilestoneIntent(lower) {
  return (
    /\b(crea|crear|nueva|nuevo|agrega|agregar|añade|añadir|make|create|add)\b/.test(lower) &&
    MILESTONE_NOUN_RE.test(lower)
  );
}

function extractTaskTitleFromMessage(message) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return null;

  const patterns = [
    /\b(?:crea|crear|nueva|nuevo|agrega|agregar|añade|añadir)\s+(?:una|un)?\s*(?:tarea|task)\s+(?:para|que|de|llamad[ao]|denominad[ao])\s*["']?(.+?)["']?(?:\s+(?:en|con|para|de|prioridad|priority|y))?$/i,
    /\b(?:crea|crear|nueva|nuevo|agrega|agregar|añade|añadir)\s+(?:una|un)?\s*(?:tarea|task)\s+["']?(.+?)["']?(?:\s+(?:en|con|para|de|prioridad|priority|y))?$/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractMilestoneTitleFromMessage(message) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return null;

  const patterns = [
    /\b(?:crea|crear|nueva|nuevo|agrega|agregar|añade|añadir)\s+(?:un|una)?\s*(?:hito|milestone)\s+(?:para|que|de|llamad[ao]|denominad[ao])\s*["']?(.+?)["']?(?:\s+(?:en|con|para|de|y))?$/i,
    /\b(?:crea|crear|nueva|nuevo|agrega|agregar|añade|añadir)\s+(?:un|una)?\s*(?:hito|milestone)\s+["']?(.+?)["']?(?:\s+(?:en|con|para|de|y))?$/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

/**
 * User wants every open panel closed (no specific name): "cierra las terminales abiertas".
 *
 * @param {string} lower
 * @param {string} text
 * @param {Array<{ terminalId: string, displayName?: string }>} terminals
 * @returns {boolean}
 */
export function wantsCloseAllTerminals(lower, text, terminals = []) {
  if (!CLOSE_VERBS.test(lower) || !TERMINAL_NOUN_RE.test(lower)) return false;

  const multiNames = extractMultipleCloseNames(text, terminals);
  if (multiNames === 'AMBIGUOUS' || multiNames.length > 0) return false;

  const singleName = extractTerminalNameFromMessage(text, terminals);
  if (singleName === 'AMBIGUOUS' || singleName) return false;

  if (
    /\b(todas?\s+las?\s+terminales?|todos?\s+los?\s+paneles?|todas?\s+las?\s+paneles?|all\s+terminals?)\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (/\b(las|los)\s+(terminales|paneles)\b/.test(lower)) return true;
  if (/\b(terminales|paneles)\s+(abiertas?|activas?|actuales?)\b/.test(lower)) return true;
  return false;
}

/**
 * Resolve a fast-path intent from user message + workspace context.
 *
 * @param {string} message
 * @param {object} [context]
 * @returns {ZedFastPathHit | null}
 */
export function resolveZedFastPathIntent(message, context = {}) {
  if (process.env.ZED_FAST_PATH === '0') return null;

  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || text.length > 240) return null;

  const lower = normalizeAgentAliases(text);
  const terminals = mergedTerminals(context);
  const terminalCount = terminals.length;
  const program = detectAgentProgram(text);
  const explicitTarget = resolveExplicitExistingTerminalTarget(text, terminals);
  if (explicitTarget?.code === 'ambiguous') return null;

  // --- open URL ---
  const url = extractUrl(text);
  if (
    url &&
    /\b(abre|abr|open|muestra|mostr|ir a|navega|navegador|pizarra|pagina|página|url|sitio|web)\b/.test(
      lower
    )
  ) {
    return hit([{ tool: 'open_url', input: { url, focus: true } }], 'open_url', 0.94, 'open_url');
  }

  // --- workspace UI actions (before terminal open to avoid "abre configuración de terminal" → open_terminal) ---
  if (isOpenSettingsIntent(lower)) {
    return hit(
      [{ tool: 'workspace_action', input: { action: 'open_restore_settings' } }],
      'open_settings',
      0.94,
      'open_restore_settings'
    );
  }
  if (isCloseSettingsIntent(lower)) {
    return hit(
      [{ tool: 'workspace_action', input: { action: 'close_restore_settings' } }],
      'close_settings',
      0.94,
      'close_restore_settings'
    );
  }
  if (isTogglePizarraIntent(lower)) {
    return hit(
      [{ tool: 'workspace_action', input: { action: 'toggle_pizarra' } }],
      'toggle_pizarra',
      0.92,
      'toggle_pizarra'
    );
  }

  // --- open NEW terminal (before execute-in-existing; never reuse when user asks for new panel) ---
  if (isOpenTerminalIntent(lower) && (wantsNewTerminal(lower) || !explicitTarget?.ok)) {
    const count = extractTerminalCount(text);
    if (program) {
      const steps = Array.from({ length: count }, () => ({
        tool: 'open_terminal',
        input: { program },
      }));
      return hit(steps, 'open_terminal_agent', 0.92, `open_terminal:${program}x${count}`);
    }
    const steps = Array.from({ length: count }, () => ({ tool: 'open_terminal', input: {} }));
    return hit(steps, 'open_terminal', 0.9, 'open_terminal_new');
  }

  // --- agent in EXISTING named terminal: "opencode en Chase" (requires explicit name) ---
  const agentTarget = extractAgentInTerminal(text, terminals);
  if (agentTarget === 'AMBIGUOUS') return null;
  if (agentTarget && !wantsNewTerminal(lower)) {
    return hit(
      [
        {
          tool: 'execute_in_terminal',
          input: { name: agentTarget.name, program: agentTarget.program },
        },
      ],
      'execute_agent_in_terminal',
      0.93,
      `agent:${agentTarget.program}`
    );
  }

  // --- close terminal(s) ---
  if (CLOSE_VERBS.test(lower)) {
    const multiNames = extractMultipleCloseNames(text, terminals);
    if (multiNames === 'AMBIGUOUS') return null;
    if (multiNames.length >= 2) {
      return hit(
        [{ tool: 'close_all_terminals', input: { names: multiNames } }],
        'close_multiple',
        0.93,
        'close_multiple'
      );
    }

    if (wantsCloseAllTerminals(lower, text, terminals) && terminalCount > 0) {
      return hit(
        [
          {
            tool: 'close_all_terminals',
            input: { names: terminals.map((t) => t.displayName || t.terminalId) },
          },
        ],
        'close_multiple',
        0.93,
        'close_all_terminals'
      );
    }

    if (multiNames.length === 1) {
      return hit(
        [{ tool: 'close_terminal', input: { name: multiNames[0] } }],
        'close_terminal',
        0.94,
        'close_named'
      );
    }

    if (TERMINAL_NOUN_RE.test(lower)) {
      const name = extractTerminalNameFromMessage(text, terminals);
      if (name === 'AMBIGUOUS') return null;
      const input = name ? { name } : {};
      const confidence = name ? 0.94 : terminalCount === 1 ? 0.9 : terminalCount > 1 ? 0.75 : 0.85;
      return hit(
        [{ tool: 'close_terminal', input }],
        'close_terminal',
        confidence,
        name ? 'close_named' : 'close_implicit'
      );
    }

    const shortName = extractTerminalNameFromMessage(text, terminals);
    if (shortName === 'AMBIGUOUS') return null;
    if (shortName) {
      return hit(
        [{ tool: 'close_terminal', input: { name: shortName } }],
        'close_terminal',
        0.92,
        'close_short'
      );
    }
  }

  // --- list terminals (strict — never when user wants to open/close) ---
  if (isListTerminalsIntent(lower, text)) {
    return hit(
      [{ tool: 'list_terminals', input: {} }],
      'list_terminals',
      0.96,
      'list_terminals_pattern'
    );
  }

  // --- DevHub MCP read actions ---
  if (isListProjectsIntent(lower)) {
    return hit([{ tool: 'list_projects', input: {} }], 'list_projects', 0.94, 'list_projects');
  }
  if (isListTasksIntent(lower)) {
    return hit(
      [{ tool: 'list_tasks', input: { status: 'all' } }],
      'list_tasks',
      0.94,
      'list_tasks'
    );
  }
  if (isGetExecutionQueueIntent(lower)) {
    return hit(
      [{ tool: 'get_execution_queue', input: {} }],
      'get_execution_queue',
      0.94,
      'get_execution_queue'
    );
  }

  // --- DevHub MCP write actions (simple templates) ---
  if (isCreateTaskIntent(lower)) {
    const title = extractTaskTitleFromMessage(text);
    if (title) {
      return hit(
        [{ tool: 'create_task', input: { title, priority: 'medium' } }],
        'create_task',
        0.92,
        'create_task'
      );
    }
  }
  if (isCreateMilestoneIntent(lower)) {
    const title = extractMilestoneTitleFromMessage(text);
    if (title) {
      return hit(
        [{ tool: 'create_milestone', input: { title } }],
        'create_milestone',
        0.92,
        'create_milestone'
      );
    }
  }

  return null;
}

export default resolveZedFastPathIntent;
