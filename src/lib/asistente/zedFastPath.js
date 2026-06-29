/**
 * Zed fast path — local intent router for frequent commands.
 * Skips MiniMax when confidence is high; falls back to LLM otherwise.
 */

import { resolveTerminalByName } from './zedTerminalResolver';
import { resolveNamedTerminalFromMessage } from './zedTerminalNamePhrase';
import { buildZedTerminalCatalog } from './workspaceTerminalRegistry';
import { stripDiacritics } from '../text';

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
  return stripDiacritics(text).toLowerCase();
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

const SWARM_NOUN_RE = /\b(swarm|enjambre|misión|mision|mission|missions)\b/;
const FILE_NOUN_RE = /\b(archivos?|file|files?|directorio|carpeta|folder)\b/;
const LOG_NOUN_RE = /\b(log|logs|bitácora|registro)\b/;
const BROWSER_NOUN_RE = /\b(navegador|browser|página|pagina|sitio|web|url)\b/;

function isGetSwarmStatusIntent(lower) {
  return (
    SWARM_NOUN_RE.test(lower) && /\b(estado|status|activa|activo|hay|qu[eé]|que)\b/.test(lower)
  );
}

function isBrowseFilesListIntent(lower) {
  return (
    /\b(lista|listar|mostrar|muestra|ver|explora|navega)\b/.test(lower) && FILE_NOUN_RE.test(lower)
  );
}

function isBrowseFilesReadIntent(lower) {
  return (
    /\b(lee|leer|contenido|mostrar|muestra|ver)\b/.test(lower) && /\b(archivo|file)\b/.test(lower)
  );
}

function isReviewLogFileIntent(lower) {
  const asksReview =
    /\b(lee|leer|mostr|ver|últimas|ultimas|revisar|revisa)\b/.test(lower) ||
    /mu[eé]str/i.test(lower);
  return LOG_NOUN_RE.test(lower) && asksReview;
}

function isSummarizeTerminalIntent(lower) {
  const asksWhatHappens =
    /\bqu[eé]\s+(?:está\s+)?pas/i.test(lower) || /\bque\s+(?:esta\s+)?pas/i.test(lower);
  const asksStatus = /\b(estado|status)\b/.test(lower);
  const asksResume = /\b(resume|resumí|resumen)\b/.test(lower);
  return TERMINAL_NOUN_RE.test(lower) && (asksWhatHappens || asksStatus || asksResume);
}

function isCloseUrlIntent(lower) {
  return CLOSE_VERBS.test(lower) && BROWSER_NOUN_RE.test(lower);
}

function extractQuotedOrPathToken(message) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return null;

  const quoted = raw.match(/["']([^"']+)["']/);
  if (quoted) {
    const value = quoted[1];
    if (!/^https?:\/\//i.test(value)) return value;
  }

  const preposition = raw.match(/\b(?:de|en)\s+(\S+)/i);
  if (preposition) {
    const value = preposition[1];
    if (!/^https?:\/\//i.test(value)) return value;
  }

  const candidate = raw
    .split(/\s+/)
    .find(
      (token) =>
        !/^https?:\/\//i.test(token) &&
        (token.includes('/') || token.includes('\\') || /\.[a-zA-Z0-9]{1,10}$/.test(token))
    );
  return candidate || null;
}

function extractCommandForExistingTerminal(message) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return null;

  const match = raw.match(
    /^(?:por\s+favor\s+)?(?:ejecuta|ejecutar|corre|correr|run|execute)\s+(.+?)\s+(?:en|in)\s+(.+)$/i
  );
  if (!match) return null;
  return { command: match[1].trim(), terminalName: match[2].trim() };
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
const PLAN_NOUN_RE = /\b(plan|planificación|estrategia|roadmap|ruta)\b/;

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

const ARRANGE_VERBS =
  /\b(auto-ordena|autoordena|ordena|ordenar|organiza|organizar|acomoda|acomodar|auto-organizar|autoorganizar|distribuye|distribuir|arrange|organize|tidy|clean|auto-arrange|fit)\b/;

function isArrangePizarraIntent(lower) {
  return ARRANGE_VERBS.test(lower) && PIZARRA_NOUN_RE.test(lower);
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

const AGENT_PROGRAM_ALIASES = {
  opencode: ['opencode', 'open code', 'open-code'],
  codex: ['codex', 'code x'],
  hermes: ['hermes'],
  kimi: ['kimi', 'kimy', 'quimy'],
};

function extractLaunchAgentProgram(message) {
  const lower = normalizeAgentAliases(message);
  for (const [program, aliases] of Object.entries(AGENT_PROGRAM_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) return program;
    }
  }
  return null;
}

function isLaunchAgentSessionIntent(lower, text) {
  if (!/\b(abre|abr|lanza|lanzar|inicia|iniciar|deploy|despliega|launch)\b/.test(lower))
    return false;
  return extractLaunchAgentProgram(text) !== null;
}

function isCreatePlanIntent(lower) {
  return (
    /\b(crea|crear|arma|armar|hace|hacer|genera|generar|diseña|diseñar)\b/.test(lower) &&
    PLAN_NOUN_RE.test(lower)
  );
}

function extractPlanObjective(message) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return '';

  const match = raw.match(
    /\b(?:crea|crear|arma|armar|hace|hacer|genera|generar|diseña|diseñar)\s+(?:un|una)?\s*(?:plan|planificación|estrategia|roadmap)\s+(?:para|de|que|sobre)?\s*["']?(.+?)["']?$/i
  );
  if (match?.[1]) return match[1].trim();

  // Fallback: remove plan keywords and keep the rest.
  return raw
    .replace(
      /\b(crea|crear|arma|armar|hace|hacer|genera|generar|diseña|diseñar|un|una|plan|planificación|estrategia|roadmap|para|de)\b/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAgentPrompt(message) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return '';

  const match = raw.match(
    /(?:prompt|con\s+(?:el\s+)?prompt|diciendo|que\s+diga|para\s+que)\s*[:-]?\s*["']?(.+?)["']?$/i
  );
  if (match?.[1]) return match[1].trim();

  const program = extractLaunchAgentProgram(raw);
  if (!program) return '';

  // Remove launcher verbs and program name; keep the rest as prompt.
  const remainder = raw
    .replace(/\b(?:abre|abr|lanza|lanzar|inicia|iniciar|deploy|despliega|launch|una|un)\b/gi, '')
    .replace(new RegExp(`\\b(?:${AGENT_PROGRAM_ALIASES[program].join('|')})\\b`, 'gi'), '')
    .replace(/\b(?:terminal|panel|sesion|sesión|agente)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return remainder;
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
  if (isArrangePizarraIntent(lower)) {
    return hit(
      [{ tool: 'workspace_action', input: { action: 'arrange_pizarra' } }],
      'arrange_pizarra',
      0.94,
      'arrange_pizarra'
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

  // --- read-only workspace queries ---
  if (isGetSwarmStatusIntent(lower)) {
    return hit(
      [{ tool: 'get_swarm_status', input: {} }],
      'get_swarm_status',
      0.94,
      'get_swarm_status'
    );
  }

  if (isSummarizeTerminalIntent(lower)) {
    const name = extractTerminalNameFromMessage(text, terminals);
    if (name && name !== 'AMBIGUOUS') {
      return hit(
        [{ tool: 'summarize_terminal', input: { name } }],
        'summarize_terminal',
        0.92,
        'summarize_terminal_named'
      );
    }
  }

  // "qué pasa en Chase" — terminal name via explicit "en" phrase.
  const summarizeTarget = resolveExplicitExistingTerminalTarget(text, terminals);
  if (
    summarizeTarget?.ok &&
    /qu[eé]\s+(?:está\s+)?pas|que\s+(?:esta\s+)?pas|estado|status|resumen|resume/i.test(lower)
  ) {
    return hit(
      [{ tool: 'summarize_terminal', input: { name: summarizeTarget.displayName } }],
      'summarize_terminal',
      0.92,
      'summarize_terminal_explicit'
    );
  }

  if (isBrowseFilesListIntent(lower)) {
    const path = extractQuotedOrPathToken(text) || '.';
    return hit(
      [{ tool: 'browse_files', input: { action: 'list', path } }],
      'browse_files_list',
      0.91,
      'browse_files_list'
    );
  }

  if (isBrowseFilesReadIntent(lower)) {
    const path = extractQuotedOrPathToken(text);
    if (path) {
      return hit(
        [{ tool: 'browse_files', input: { action: 'read', path } }],
        'browse_files_read',
        0.92,
        'browse_files_read'
      );
    }
  }

  if (isReviewLogFileIntent(lower)) {
    const path = extractQuotedOrPathToken(text);
    if (path) {
      return hit(
        [{ tool: 'review_log_file', input: { path } }],
        'review_log_file',
        0.92,
        'review_log_file'
      );
    }
  }

  if (isCloseUrlIntent(lower)) {
    return hit([{ tool: 'close_url', input: { confirm: true } }], 'close_url', 0.94, 'close_url');
  }

  // --- execute command in an existing named terminal ---
  const execExisting = extractCommandForExistingTerminal(text);
  if (execExisting) {
    const lookup = resolveTerminalByName(execExisting.terminalName, terminals);
    if (lookup.ok) {
      return hit(
        [
          {
            tool: 'execute_in_terminal',
            input: { name: lookup.displayName, input: `${execExisting.command}\n` },
          },
        ],
        'execute_in_terminal_named',
        0.91,
        'execute_in_terminal_named'
      );
    }
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

  // --- agent launcher ---
  if (isLaunchAgentSessionIntent(lower, text)) {
    const program = extractLaunchAgentProgram(text);
    const prompt = extractAgentPrompt(text);
    if (program && prompt) {
      return hit(
        [{ tool: 'launch_agent_session', input: { program, prompt } }],
        'launch_agent_session',
        0.91,
        `launch_agent_session:${program}`
      );
    }
  }

  // --- multi-step planner ---
  if (isCreatePlanIntent(lower)) {
    const objective = extractPlanObjective(text);
    if (objective) {
      return hit(
        [{ tool: 'create_plan', input: { objective } }],
        'create_plan',
        0.93,
        'create_plan'
      );
    }
  }

  return null;
}

export default resolveZedFastPathIntent;
