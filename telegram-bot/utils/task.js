/**
 * Shared task utilities for the Telegram bot.
 *
 * Single source of truth for task-classification helpers used across
 * commands/ and services/.  Import from here — never redefine locally.
 */

const DIRECT_EXECUTION_PATTERNS = [
  /(^|\s)(ls|pwd|dir|tree|whoami)(\s|$)/i,
  /\b(realiz[áa]|corr[eé]|ejecut[aá]|run)\s+un\s+(ls|pwd|dir|tree)\b/i,
  /\b(mostra(?:me|r)?|list(?:a|á|ame|ar)?|indic(?:a|ame)|decime)\b.*\b(archivos|contenido|directorios?|carpetas?)\b/i,
  /\b(archivos|contenido)\b.*\b(directorio|carpeta)\b/i,
  /\b(current|working)\s+directory\b/i,
];

const AUTONOMOUS_TASK_PATTERNS = [
  /\b(implement(?:ar)?|fix|refactor|rewrite|migrate|build|create|continue|finish|complete)\b/i,
  /\b(implementar|arreglar|corregir|refactorizar|reescribir|migrar|construir|crear|continuar|terminar|completar)\b/i,
  /\b(spec|design|proposal|workflow|multi-step|autonomous|tests?|regression|bug|feature|task[s]?)\b/i,
  /\b(sdd|requerimientos|escenarios|arquitectura|implementaci[oó]n|pruebas|regresi[oó]n)\b/i,
];

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function classifyTaskIntent(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return {
      intent: 'empty',
      shouldUseMultiTurn: false,
      reason: 'empty-input',
    };
  }

  const directExecution = DIRECT_EXECUTION_PATTERNS.some((pattern) => pattern.test(normalized));
  const autonomousSignals = AUTONOMOUS_TASK_PATTERNS.filter((pattern) => pattern.test(normalized));
  const isLongPrompt = normalized.length > 180;

  if (directExecution && autonomousSignals.length === 0) {
    return {
      intent: 'direct-command',
      shouldUseMultiTurn: false,
      reason: 'direct-operational-request',
    };
  }

  if (autonomousSignals.length > 0 || (isLongPrompt && !directExecution)) {
    return {
      intent: 'autonomous-task',
      shouldUseMultiTurn: true,
      reason: autonomousSignals.length > 0 ? 'complex-task-signals' : 'long-open-ended-request',
    };
  }

  return {
    intent: 'single-turn-chat',
    shouldUseMultiTurn: false,
    reason: 'default-single-turn',
  };
}

function shouldUseMultiTurn(text) {
  return classifyTaskIntent(text).shouldUseMultiTurn;
}

function isMultiTurnTask(text) {
  return shouldUseMultiTurn(text);
}

module.exports = {
  classifyTaskIntent,
  shouldUseMultiTurn,
  isMultiTurnTask,
};
