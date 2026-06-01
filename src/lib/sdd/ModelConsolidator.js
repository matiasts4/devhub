/**
 * @module ModelConsolidator
 * Model alias resolution → minimax-coding-plan/MiniMax-M2.7
 * Strict TDD capability detection
 * TDD cycle evidence format for apply-progress
 */

'use strict';

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Model alias resolution
// ---------------------------------------------------------------------------

const MODEL_ALIAS_MAP = {
  // Unified model for all swarm roles
  'minimax-2.7': 'minimax-coding-plan/MiniMax-M2.7',
  'minimax-m2.7': 'minimax-coding-plan/MiniMax-M2.7',
  minimax: 'minimax-coding-plan/MiniMax-M2.7',
  'mm2.7': 'minimax-coding-plan/MiniMax-M2.7',
  'opencode-minimax': 'minimax-coding-plan/MiniMax-M2.7',
  'minimax-3': 'minimax-coding-plan/MiniMax-M3',
  'minimax-m3': 'minimax-coding-plan/MiniMax-M3',
  'mm3': 'minimax-coding-plan/MiniMax-M3',
  'minimax-coding-plan/minimax-m3': 'minimax-coding-plan/MiniMax-M3',
  // Legacy aliases from existing profiles
  'claude-sonnet-4-20250514': 'minimax-coding-plan/MiniMax-M2.7',
  'claude-opus-4-20250514': 'minimax-coding-plan/MiniMax-M2.7',
  'github-copilot/gpt-5.4-mini': 'minimax-coding-plan/MiniMax-M2.7',
  'github-copilot/gpt-5.4': 'minimax-coding-plan/MiniMax-M2.7',
  // Generic fallbacks
  default: 'minimax-coding-plan/MiniMax-M2.7',
  'swarm-default': 'minimax-coding-plan/MiniMax-M2.7',
  // null/undefined handling
  null: 'minimax-coding-plan/MiniMax-M2.7',
  undefined: 'minimax-coding-plan/MiniMax-M2.7',
};

/**
 * Resolve a model alias to the canonical model ID.
 */
function resolveModelAlias(alias) {
  if (!alias) return MODEL_ALIAS_MAP['default'];
  const normalized = String(alias).trim().toLowerCase();
  return MODEL_ALIAS_MAP[normalized] || MODEL_ALIAS_MAP['default'];
}

/**
 * Get all known aliases for a model.
 */
function getModelAliases(modelId) {
  return Object.entries(MODEL_ALIAS_MAP)
    .filter(([, resolved]) => resolved === modelId)
    .map(([alias]) => alias);
}

/**
 * Check if a model ID is the unified model.
 */
function isUnifiedModel(modelId) {
  return modelId === 'minimax-coding-plan/MiniMax-M2.7' || modelId === 'minimax-coding-plan/MiniMax-M3';
}

// ---------------------------------------------------------------------------
// TDD capability detection
// ---------------------------------------------------------------------------

const TEST_RUNNERS = {
  jest: {
    detect: ['jest.config.js', 'jest.config.ts', 'package.json'],
    run: 'npm test -- --passWithNoTests',
    testPattern: '**/__tests__/**/*.js',
  },
  vitest: {
    detect: ['vitest.config.ts', 'vitest.config.js'],
    run: 'npx vitest',
    testPattern: '**/*.test.ts',
  },
  'next test': {
    detect: ['next.config.js', 'package.json'],
    run: 'npm test',
    testPattern: '**/*.test.{js,jsx,ts,tsx}',
  },
  playwright: {
    detect: ['playwright.config.ts', 'playwright.config.js'],
    run: 'npx playwright test',
    testPattern: '**/*.spec.{js,ts}',
  },
};

/**
 * Detect which test runner is available in the project.
 */
function detectTestRunner(projectRoot = process.cwd()) {
  for (const [name, config] of Object.entries(TEST_RUNNERS)) {
    for (const file of config.detect) {
      const filePath = path.join(projectRoot, file);
      if (fs.existsSync(filePath)) {
        // For package.json, verify jest or next test is actually in scripts
        if (file === 'package.json') {
          try {
            const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            if (pkg.scripts?.test) {
              return { name, config, available: true };
            }
          } catch {
            // ignore parse errors
          }
          continue;
        }
        return { name, config, available: true };
      }
    }
  }
  return { name: null, config: null, available: false };
}

/**
 * Check if a model can implement strict TDD.
 * Currently tied to test runner availability and model capability.
 */
function canImplementTDD(modelId) {
  const resolved = resolveModelAlias(modelId);
  // MiniMax 2.7 has enough context window for TDD cycles
  return isUnifiedModel(resolved);
}

/**
 * Get TDD capability details for a model.
 */
function getTDDCapability(modelId) {
  const resolved = resolveModelAlias(modelId);
  const unified = isUnifiedModel(resolved);
  const testRunner = detectTestRunner();

  return {
    canImplement: unified,
    reason: unified
      ? `${resolved} has sufficient context window for TDD cycles`
      : 'Model does not meet TDD requirements (context window or capability)',
    modelId: resolved,
    testRunnerAvailable: testRunner.available,
    testRunnerName: testRunner.name,
    strictTddRequired: process.env.SDD_STRICT_TDD === 'true',
  };
}

// ---------------------------------------------------------------------------
// TDD cycle evidence format
// ---------------------------------------------------------------------------

/**
 * Create an empty TDD evidence record.
 */
function createTDDEvidence() {
  return {
    cycles: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    passed: false,
  };
}

/**
 * Record a RED phase (test written first).
 */
function recordRedPhase(evidence, { taskId, testCode, expectedBehavior }) {
  evidence.cycles.push({
    phase: 'RED',
    taskId,
    testCode,
    expectedBehavior,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Record a GREEN phase (implementation passes tests).
 */
function recordGreenPhase(evidence, { taskId: _taskId, implementation, testsPassed }) {
  const lastCycle = evidence.cycles[evidence.cycles.length - 1];
  if (lastCycle && lastCycle.phase === 'RED') {
    lastCycle.implementation = implementation;
    lastCycle.testsPassed = testsPassed;
    lastCycle.phase = 'GREEN';
    lastCycle.timestamp = new Date().toISOString();
  }
}

/**
 * Record a REFACTOR phase.
 */
function recordRefactorPhase(evidence, { taskId: _taskId, beforeCode, afterCode, reason }) {
  const lastCycle = evidence.cycles[evidence.cycles.length - 1];
  if (lastCycle && lastCycle.phase === 'GREEN') {
    lastCycle.refactor = { beforeCode, afterCode, reason };
    lastCycle.timestamp = new Date().toISOString();
  }
}

/**
 * Mark evidence as complete and passed.
 */
function completeTDDEvidence(evidence, passed = true) {
  evidence.completedAt = new Date().toISOString();
  evidence.passed = passed;
}

/**
 * Format TDD evidence for apply-progress artifact.
 */
function formatTDDEvidence(evidence) {
  if (!evidence || !evidence.cycles || evidence.cycles.length === 0) {
    return null;
  }

  const lines = [
    '## TDD Cycle Evidence',
    '',
    `| Cycle | Task | RED | GREEN | REFACTOR |`,
    `|-------|------|-----|-------|----------|`,
  ];

  for (let i = 0; i < evidence.cycles.length; i++) {
    const cycle = evidence.cycles[i];
    const cycleNum = i + 1;
    const taskId = cycle.taskId || '-';
    const red = cycle.testCode ? '✓' : '-';
    const green = cycle.implementation ? '✓' : '-';
    const refactor = cycle.refactor ? '✓' : '-';

    lines.push(`| ${cycleNum} | ${taskId} | ${red} | ${green} | ${refactor} |`);
  }

  lines.push('');
  lines.push(`**Started**: ${evidence.startedAt}`);
  if (evidence.completedAt) {
    lines.push(`**Completed**: ${evidence.completedAt}`);
  }
  lines.push(`**Status**: ${evidence.passed ? 'PASSED' : 'FAILED'}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Apply-progress format
// ---------------------------------------------------------------------------

/**
 * Format a complete apply-progress artifact.
 */
function formatApplyProgress({
  changeName,
  phase,
  tasks = [],
  tddEvidence = null,
  deviations = [],
  notes = [],
}) {
  const lines = [
    `# Apply Progress: ${changeName}`,
    '',
    `## Phase: ${phase}`,
    `**Generated**: ${new Date().toISOString()}`,
    '',
    '## Tasks Completed',
    '',
  ];

  for (const task of tasks) {
    const status = task.completed ? '[x]' : '[ ]';
    lines.push(`- ${status} ${task.id} — ${task.description}`);
  }

  if (tddEvidence) {
    lines.push('');
    const tddText = formatTDDEvidence(tddEvidence);
    if (tddText) lines.push(tddText);
  }

  if (deviations.length > 0) {
    lines.push('');
    lines.push('## Deviations from Design');
    for (const d of deviations) {
      lines.push(`- **${d.taskId}**: ${d.reason}`);
    }
  }

  if (notes.length > 0) {
    lines.push('');
    lines.push('## Notes');
    for (const n of notes) {
      lines.push(`- ${n}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  MODEL_ALIAS_MAP,
  resolveModelAlias,
  getModelAliases,
  isUnifiedModel,
  detectTestRunner,
  canImplementTDD,
  getTDDCapability,
  createTDDEvidence,
  recordRedPhase,
  recordGreenPhase,
  recordRefactorPhase,
  completeTDDEvidence,
  formatTDDEvidence,
  formatApplyProgress,
  TEST_RUNNERS,
};
