/**
 * Zed fast path — local intent router for frequent commands.
 * Skips MiniMax when confidence is high; falls back to LLM otherwise.
 */

import { resolveTerminalByName } from './zedTerminalResolver';
import {
  resolveNamedTerminalFromMessage,
  nameCandidatesFromEnPhrase,
} from './zedTerminalNamePhrase';
import { buildZedTerminalCatalog } from './workspaceTerminalRegistry';
import { stripDiacritics } from '../text';

const AGENT_PROGRAMS = new Set(['opencode', 'codex', 'hermes', 'kimi', 'grok']);
const OPEN_VERBS = /\b(abre|abr[eía]s?|abrir|abramos|open|crea|crear|nueva|lanza|lanzar)\b/;
const CLOSE_VERBS =
  /\b(cierra|cerra|cerr[aá]|cerrar|cerralas|cerralos|cerramen|close|cierres|cierren|mata)\b/;
const TERMINAL_NOUN_RE = /\b(terminal(?:es)?|panel(?:es)?)\b/;

const NUMBER_WORDS = {
  una: 1,
  un: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
};

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
    .replace(/\bopen\s+grok\b/g, 'grok')
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
  const expanded = [];
  for (const cand of candidates) {
    expanded.push(cand, ...cleanTerminalNameChunk(cand));
  }
  for (const cand of expanded) {
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
 * Normalize a spoken/written terminal name chunk for lookup.
 * Handles "la de Eibar", "el de Chase", "terminal de Cesar", trailing punctuation.
 *
 * @param {string} chunk
 * @returns {string[]} candidate strings to try (most specific first)
 */
export function cleanTerminalNameChunk(chunk) {
  if (typeof chunk !== 'string') return [];
  const s = chunk
    .trim()
    .replace(/[.?!,;:]+$/g, '')
    .trim();
  if (!s) return [];

  const variants = new Set();
  const push = (v) => {
    const t =
      typeof v === 'string'
        ? v
            .trim()
            .replace(/[.?!,;:]+$/g, '')
            .trim()
        : '';
    if (t) variants.add(t);
  };

  push(s);
  // "la de Eibar" / "el de Chase" / "las de Avery"
  push(s.replace(/^(la|el|las|los|the)\s+de\s+/i, ''));
  push(s.replace(/^(la|el|las|los|the)\s+/i, ''));
  push(s.replace(/^(de|del|of)\s+/i, ''));
  push(s.replace(/^(terminal(?:es)?|panel(?:es)?)\s+(de\s+)?/i, ''));
  push(s.replace(/^(terminal(?:es)?|panel(?:es)?)\s+/i, ''));
  // After previous strips, still "de Eibar"
  for (const v of [...variants]) {
    push(v.replace(/^(de|del|of)\s+/i, ''));
    push(v.replace(/^(la|el|las|los|the)\s+de\s+/i, ''));
  }

  // Last token often is the display name: "la terminal de Eibar" → Eibar
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 1) push(words[words.length - 1]);

  return [...variants];
}

/**
 * Try to resolve a free-text chunk to a single terminal display name.
 * @returns {string | null | 'AMBIGUOUS'}
 */
function resolveNameFromChunk(chunk, terminals) {
  for (const cand of cleanTerminalNameChunk(chunk)) {
    const lookup = resolveTerminalByName(cand, terminals);
    if (lookup.ok) return lookup.displayName;
    if (lookup.code === 'ambiguous') return 'AMBIGUOUS';
    for (const en of nameCandidatesFromEnPhrase(cand)) {
      const inner = resolveTerminalByName(en, terminals);
      if (inner.ok) return inner.displayName;
      if (inner.code === 'ambiguous') return 'AMBIGUOUS';
    }
  }
  return null;
}

/**
 * Extract multiple terminal names from close requests: "cierra Chase y Cesar",
 * "cierra la de Eibar", "cierra la terminal de Avery".
 *
 * @param {string} message
 * @param {Array<{ terminalId: string, displayName?: string }>} terminals
 * @returns {string[] | 'AMBIGUOUS'}
 */
export function extractMultipleCloseNames(message, terminals = []) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw || !CLOSE_VERBS.test(normalizeText(raw))) return [];

  // Prefer the segment after the first close verb (supports compound open+close).
  let rest = raw.replace(
    /^.*?\b(cierra|cerra|cerr[aá]|cerrar|cerralas|cerralos|close|cierres|cierren|mata)\b\s*/i,
    ''
  );
  rest = rest
    .replace(
      /^(?:(?:la|las|el|los|todas?\s+las?|todos?\s+los?)\s+)?(?:terminales?|paneles?)?\s*/i,
      ''
    )
    .replace(/^(?:de\s+)/i, '')
    .replace(/\s+(por favor|please|gracias)\.?$/i, '')
    .trim();
  if (!rest) return [];

  // Stop at a following open-clause if the close came first: "cierra Eibar y abre una"
  rest = rest.split(/\s+(?=abre|abrir|open|crea|crear|lanza|lanzar)\b/i)[0].trim();
  if (!rest) return [];

  const chunks = rest
    .split(/\s+(?:y|e|and)\s+|,\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    // Drop pure open-side leftovers if any slipped through
    .filter((c) => !OPEN_VERBS.test(normalizeText(c)));

  const names = [];
  for (const chunk of chunks) {
    const resolved = resolveNameFromChunk(chunk, terminals);
    if (resolved === 'AMBIGUOUS') return 'AMBIGUOUS';
    if (resolved && !names.includes(resolved)) names.push(resolved);
  }
  return names;
}

/**
 * True when the user clearly targeted a close name but it did not resolve
 * against the live catalog (force LLM rather than half-executing).
 *
 * @param {string} message
 * @param {Array} terminals
 */
export function hasUnresolvedCloseTarget(message, terminals = []) {
  const lower = normalizeText(message);
  if (!CLOSE_VERBS.test(lower)) return false;
  const names = extractMultipleCloseNames(message, terminals);
  if (names === 'AMBIGUOUS') return true;
  if (names.length > 0) return false;

  // After close verb there is leftover name-like text that is not a bare open phrase.
  const after = message.replace(
    /^.*?\b(cierra|cerra|cerr[aá]|cerrar|cerralas|cerralos|close|cierres|cierren|mata)\b\s*/i,
    ''
  );
  const leftover = after
    .replace(/^(?:(?:la|las|el|los)\s+)?(?:terminales?|paneles?)?\s*/i, '')
    .replace(/\s+(por favor|please|gracias)\.?$/i, '')
    .split(/\s+(?=abre|abrir|open|crea|crear)\b/i)[0]
    .trim();
  if (!leftover) return false;
  // "cierra la terminal" with no name → implicit close, not unresolved
  if (/^(la|el|las|los)?\s*(terminales?|paneles?)?$/i.test(leftover)) return false;
  // Has some token that looks like a name (letter word not only fillers)
  return /[a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,}/.test(
    leftover.replace(/\b(la|el|las|los|de|del|the|of)\b/gi, '')
  );
}

/**
 * Compound "abre … y cierra …" / "cierra … y abre …" → multi-step local plan.
 * Returns null to fall through (or force LLM via unresolved close target).
 *
 * @param {string} text
 * @param {string} lower
 * @param {Array} terminals
 * @param {string|null} program
 * @returns {ZedFastPathHit | null}
 */
export function resolveCompoundOpenCloseIntent(text, lower, terminals, program = null) {
  if (!OPEN_VERBS.test(lower) || !CLOSE_VERBS.test(lower)) return null;

  // Need some signal that the open side is about terminals/panels (not "abre el browser").
  const openLooksLikeTerminal =
    TERMINAL_NOUN_RE.test(lower) ||
    wantsNewTerminal(lower) ||
    /\b(abre|abrir|open|crea|crear)\s+(una|un|nueva|nuevo|otra|otro|\d+|dos|tres)\b/.test(lower);
  if (!openLooksLikeTerminal) return null;

  const closeNames = extractMultipleCloseNames(text, terminals);
  if (closeNames === 'AMBIGUOUS') return null;

  if (closeNames.length === 0) {
    // Named close that didn't resolve → let LLM handle rather than open-only half plan.
    if (hasUnresolvedCloseTarget(text, terminals)) return null;
    return null;
  }

  // Open count from the open-side clause when possible.
  const openClause =
    text
      .split(/\s+(?:y(?:\s+luego)?|and(?:\s+then)?|y\s+despu[eé]s)\s+/i)
      .find((p) => OPEN_VERBS.test(normalizeText(p))) || text;
  const openCount = extractTerminalCount(openClause);
  const openSteps = Array.from({ length: openCount }, () =>
    program ? { tool: 'open_terminal', input: { program } } : { tool: 'open_terminal', input: {} }
  );
  const closeSteps = closeNames.map((name) => ({
    tool: 'close_terminal',
    input: { name },
  }));

  const openIdx = lower.search(OPEN_VERBS);
  const closeIdx = lower.search(CLOSE_VERBS);
  // Prefer user order; if close comes first, close then open.
  const steps = openIdx <= closeIdx ? [...openSteps, ...closeSteps] : [...closeSteps, ...openSteps];

  return hit(
    steps,
    'open_and_close_terminals',
    0.93,
    `compound:open${openCount}+close:${closeNames.join(',')}`
  );
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

const WINDOW_NOUN_RE = /\b(ventana(?:s)?|window(?:s)?|vista(?:s)?)\b/;

function extractWindowIndexFromMessage(message) {
  const lower = normalizeText(message);
  const digit =
    lower.match(/\b(?:ventana|window|vista)\s*(?:n[uú]mero\s*)?(\d+)\b/) ||
    lower.match(/\b(?:ventana|window|vista)\s+(?:a\s+)?(\d+)\b/) ||
    lower.match(/\b(?:a|al|hacia|to)\s*(?:la\s+)?(?:ventana|window|vista)\s*(\d+)\b/) ||
    lower.match(/\b(?:v|view)\s*(\d+)\b/);
  if (digit?.[1]) {
    const n = parseInt(digit[1], 10);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  }
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (
      new RegExp(`\\b(?:ventana|window|vista)\\s+(?:n[uú]mero\\s+)?${word}\\b`).test(lower) ||
      new RegExp(`\\b(?:ventana|window|vista)\\s+(?:a\\s+)?${word}\\b`).test(lower) ||
      new RegExp(`\\b(?:a|al|hacia)\\s+(?:la\\s+)?(?:ventana|window|vista)\\s+${word}\\b`).test(
        lower
      )
    ) {
      return value;
    }
  }
  return null;
}

function isSwitchWindowIntent(lower, text) {
  if (!WINDOW_NOUN_RE.test(lower)) return false;
  return (
    /\b(cambia|cambiar|switch|ve|ir|mueve|mover|pas[aá]|pasa)\b/.test(lower) ||
    extractWindowIndexFromMessage(text) !== null
  );
}

function isListWindowsIntent(lower) {
  if (!WINDOW_NOUN_RE.test(lower)) return false;
  return (
    /\b(cuant|cuánt|cuales|cuáles|que|qué|list|mostr|decime|dime|hay|tengo)\b/.test(lower) &&
    !/\b(cambia|cambiar|switch|ve a|ir a)\b/.test(lower)
  );
}

function extractTerminalNameForReadIntent(message, terminals) {
  const raw = typeof message === 'string' ? message.trim() : '';
  if (!raw) return null;

  const patterns = [
    /qu[eé]\s+dice\s+(?:la\s+)?(?:terminal\s+)?(?:de\s+)?(.+?)(?:\?|$)/iu,
    /qu[eé]\s+(?:dice|muestra|muestr[aá]|respondi[oó]|contest[oó])\s+(?:la\s+)?(?:terminal\s+)?(?:de\s+)?(.+?)(?:\?|$)/iu,
    /(?:lee|leer|mostr[aá]|muestra|ver|revis[aá]|revisar)\s+(?:la\s+)?(?:terminal\s+)?(?:de\s+)?(.+?)(?:\?|$)/iu,
    /what\s+does\s+(?:the\s+)?(.+?)\s+(?:terminal\s+)?say(?:\?|$)/iu,
    /read\s+(?:the\s+)?(.+?)\s+terminal(?:\?|$)/iu,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;
    const candidate = match[1].trim().replace(/\s+(por favor|please)\.?$/i, '');
    const lookup = resolveTerminalByName(candidate, terminals);
    if (lookup.ok) return lookup.displayName;
    if (lookup.code === 'ambiguous') return 'AMBIGUOUS';
    for (const cand of nameCandidatesFromEnPhrase(candidate)) {
      const inner = resolveTerminalByName(cand, terminals);
      if (inner.ok) return inner.displayName;
      if (inner.code === 'ambiguous') return 'AMBIGUOUS';
    }
  }

  const explicit = resolveNamedTerminalFromMessage(raw, terminals);
  if (explicit?.ok) return explicit.displayName;
  if (explicit?.code === 'ambiguous') return 'AMBIGUOUS';
  return null;
}

function isReadTerminalOutputIntent(lower) {
  return (
    /\b(qu[eé]\s+dice|que\s+dice|what\s+does|lee|leer|mostr[aá]|muestra|revis[aá]|revisar|contenido|salida|output)\b/.test(
      lower
    ) && TERMINAL_NOUN_RE.test(lower)
  );
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
  const asksResponse = AGENT_RESPONSE_VERBS_RE.test(lower);
  return (
    TERMINAL_NOUN_RE.test(lower) && (asksWhatHappens || asksStatus || asksResume || asksResponse)
  );
}

// "¿qué respondió/contestó/dijo…?" — note: `lower` is diacritics-stripped, so
// patterns are written without accents (respondió → respondio).
const AGENT_RESPONSE_VERBS_RE =
  /\b(respondio|respondido|contesto|contestado|dijo|escribio|termino|acabo|hizo|resultado|avance|progreso)\b|\bcomo\s+(va|esta|anda|viene)\b/;

/**
 * "¿qué respondió el agente / kimi / opencode…?" → summarize_terminal (read-only).
 * Resolves the target panel: explicit name ("en Chase") > panel running that
 * program > panel literally named like the program > single-agent / single-panel
 * fallback. Multiple candidates → null (LLM decides / asks).
 *
 * @param {string} text
 * @param {string} lower normalized message
 * @param {Array<{ terminalId: string, displayName?: string, program?: string }>} terminals
 * @param {string|null} program
 * @returns {ZedFastPathHit | null}
 */
export function resolveAgentResponseIntent(text, lower, terminals, program = null) {
  if (!AGENT_RESPONSE_VERBS_RE.test(lower)) return null;
  const mentionsAgent = Boolean(program) || /\bagentes?\b/.test(lower);
  if (!mentionsAgent) return null;

  const named = resolveExplicitExistingTerminalTarget(text, terminals);
  if (named?.code === 'ambiguous') return null;
  let target = named?.ok ? named.displayName : null;

  if (!target && program) {
    const byProgram = terminals.filter((t) => t.program === program);
    if (byProgram.length === 1) target = byProgram[0].displayName;
  }
  if (!target && program) {
    const byName = resolveTerminalByName(program, terminals);
    if (byName.ok) target = byName.displayName;
  }
  if (!target) {
    const withProgram = terminals.filter((t) => t.program);
    if (withProgram.length === 1) target = withProgram[0].displayName;
    else if (terminals.length === 1) target = terminals[0].displayName;
  }
  if (!target) return null;

  return hit(
    [{ tool: 'summarize_terminal', input: { name: target, ...(program ? { program } : {}) } }],
    'summarize_terminal',
    0.9,
    'agent_response'
  );
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
  grok: ['grok', 'groc'],
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

  // --- compound open + close (before single-intent open which would swallow "cierra …") ---
  const compound = resolveCompoundOpenCloseIntent(text, lower, terminals, program);
  if (compound) return compound;
  // User asked both open and close but the close target was not resolved → LLM.
  if (
    OPEN_VERBS.test(lower) &&
    CLOSE_VERBS.test(lower) &&
    hasUnresolvedCloseTarget(text, terminals)
  ) {
    return null;
  }

  // --- "¿qué respondió el agente/kimi/opencode…?" (read-only; must run BEFORE
  // extractAgentInTerminal, which would treat "kimi en Chase" as a launch) ---
  if (!OPEN_VERBS.test(lower) && !CLOSE_VERBS.test(lower)) {
    const agentResponse = resolveAgentResponseIntent(text, lower, terminals, program);
    if (agentResponse) return agentResponse;
  }

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

  if (isSwitchWindowIntent(lower, text)) {
    const windowIndex = extractWindowIndexFromMessage(text);
    if (windowIndex) {
      return hit(
        [
          {
            tool: 'workspace_action',
            input: { action: 'switch_workspace_window', window_index: windowIndex },
          },
        ],
        'switch_workspace_window',
        0.95,
        `switch_window:${windowIndex}`
      );
    }
  }

  if (isListWindowsIntent(lower)) {
    return hit(
      [{ tool: 'workspace_action', input: { action: 'list_workspace_windows' } }],
      'list_workspace_windows',
      0.94,
      'list_workspace_windows'
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

  if (isReadTerminalOutputIntent(lower)) {
    const readName = extractTerminalNameForReadIntent(text, terminals);
    if (readName === 'AMBIGUOUS') return null;
    if (readName) {
      return hit(
        [{ tool: 'review_terminal_output', input: { name: readName } }],
        'review_terminal_output',
        0.94,
        'review_terminal_named'
      );
    }
    if (terminalCount === 1 && terminals[0]?.displayName) {
      return hit(
        [{ tool: 'review_terminal_output', input: { name: terminals[0].displayName } }],
        'review_terminal_output',
        0.88,
        'review_terminal_single'
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
