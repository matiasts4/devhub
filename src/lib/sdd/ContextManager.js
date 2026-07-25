/**
 * @module ContextManager
 * Token budget enforcement (~8k tokens), role-specific artifact filtering,
 * summary handoff production (200-400 tokens) between phases.
 */

'use strict';

/**
 * Simple token counter using word-based estimation.
 * ~4 characters per token on average.
 */
function countTokens(content) {
  if (!content || typeof content !== 'string') return 0;
  // Rough estimation: 1 token ≈ 4 characters for English text
  return Math.ceil(content.length / 4);
}

/**
 * Estimate tokens for a structured object (artifacts, etc.)
 */
function countTokensForObject(obj) {
  if (!obj) return 0;
  const json = JSON.stringify(obj);
  return countTokens(json);
}

/**
 * Filter artifacts based on role + phase, respecting token budget.
 * Returns filtered artifacts and a budget summary.
 */
function filterArtifacts(role, phase, artifacts = [], tokenBudget = 8000) {
  // Artifact relevance mapping per role + phase
  const ARTIFACT_MAP = {
    director: {
      'sdd-explore': ['proposal'],
      'sdd-propose': ['proposal', 'spec'],
      'sdd-design': ['proposal', 'spec', 'design'],
      'sdd-spec': ['proposal', 'spec', 'design', 'tasks'],
      'sdd-tasks': ['proposal', 'spec', 'design', 'tasks'],
      'sdd-apply': ['spec', 'design', 'tasks', 'apply-progress'],
      'sdd-verify': ['spec', 'design', 'tasks', 'apply-progress'],
      'sdd-archive': ['spec', 'design', 'tasks', 'apply-progress', 'verify-progress'],
    },
    architect: {
      'sdd-design': ['proposal', 'spec'],
      'sdd-spec': ['proposal', 'spec', 'design'],
      'sdd-apply': ['spec', 'design'],
      'sdd-verify': ['spec', 'design', 'tasks'],
    },
    coder: {
      'sdd-apply': ['spec', 'design', 'tasks'],
      'sdd-verify': ['spec', 'design', 'tasks', 'apply-progress'],
    },
    explorer: {
      'sdd-explore': ['proposal'],
      'sdd-propose': ['proposal'],
      'sdd-design': ['proposal', 'spec'],
    },
    qa: {
      'sdd-verify': ['spec', 'design', 'tasks', 'apply-progress'],
      'sdd-apply': ['spec', 'design'],
      'sdd-archive': ['spec', 'design', 'tasks', 'apply-progress', 'verify-progress'],
    },
    reviewer: {
      'sdd-verify': ['spec', 'design', 'apply-progress'],
      'sdd-apply': ['spec', 'design'],
    },
    devops: {
      'sdd-apply': ['tasks', 'apply-progress'],
      'sdd-archive': ['apply-progress', 'verify-progress'],
    },
    auditor: {
      'sdd-verify': ['spec', 'design', 'tasks', 'apply-progress', 'verify-progress'],
      'sdd-archive': ['spec', 'design', 'tasks', 'apply-progress', 'verify-progress'],
    },
  };

  const roleMap = ARTIFACT_MAP[role] || ARTIFACT_MAP.coder;
  const allowedKinds = roleMap[phase] || [];

  // Filter to only relevant artifact kinds
  const filtered = artifacts.filter((artifact) => {
    const kind = artifact.kind || artifact.type || artifact.artifact_type || '';
    return allowedKinds.some((allowed) => kind.includes(allowed));
  });

  // Calculate total tokens
  let totalTokens = 0;
  const withTokens = filtered.map((artifact) => {
    const content = artifact.content || JSON.stringify(artifact);
    const tokens = countTokens(content);
    totalTokens += tokens;
    return { ...artifact, _tokens: tokens };
  });

  // If over budget, truncate from the end (least relevant)
  if (totalTokens > tokenBudget) {
    let currentTotal = 0;
    const truncated = [];
    for (const artifact of withTokens) {
      if (currentTotal + artifact._tokens <= tokenBudget - 200) {
        truncated.push(artifact);
        currentTotal += artifact._tokens;
      } else {
        // Add truncated note
        truncated.push({
          ...artifact,
          content: `[TRUNCATED] Original had ${artifact._tokens} tokens. Summarize this artifact.`,
          _tokens: countTokens('[TRUNCATED]'),
        });
        break;
      }
    }
    return {
      artifacts: truncated,
      totalTokens: currentTotal,
      budget: tokenBudget,
      truncated: truncated.length < withTokens.length,
    };
  }

  return {
    artifacts: withTokens,
    totalTokens,
    budget: tokenBudget,
    truncated: false,
  };
}

/**
 * Produce a summary handoff from artifacts (200-400 tokens).
 * Used when handing off between phases.
 */
function produceSummaryHandoff(artifacts = [], options = {}) {
  const maxTokens = options.maxTokens || 350;
  const summaryParts = [];

  // Summarize each artifact type
  const byType = {};
  for (const artifact of artifacts) {
    const kind = artifact.kind || artifact.type || artifact.artifact_type || 'unknown';
    if (!byType[kind]) byType[kind] = [];
    byType[kind].push(artifact);
  }

  for (const [kind, items] of Object.entries(byType)) {
    if (summaryParts.join(' ').length / 4 >= maxTokens) break;

    if (items.length === 1) {
      const a = items[0];
      const title = a.title || a.summary || kind;
      const content = a.content || a.body || JSON.stringify(a);
      const tokens = countTokens(content);
      if (tokens > 150) {
        summaryParts.push(`[${kind}]: ${title} — ${content.substring(0, 200)}...`);
      } else {
        summaryParts.push(`[${kind}]: ${title} — ${content}`);
      }
    } else {
      summaryParts.push(`[${kind}]: ${items.length} items`);
    }
  }

  const summary = summaryParts.join('\n');
  return {
    summary,
    tokens: countTokens(summary),
    artifactCount: artifacts.length,
  };
}

/**
 * Inject context into a prompt with token budget awareness.
 */
function injectContext(prompt, artifacts = [], role, phase, options = {}) {
  const tokenBudget = options.tokenBudget || 8000;
  const promptTokens = countTokens(prompt);
  const availableBudget = tokenBudget - promptTokens - 200; // 200 token buffer

  if (availableBudget <= 0) {
    return {
      prompt,
      artifacts: [],
      injected: false,
      reason: 'Prompt too large for budget',
    };
  }

  const {
    artifacts: filtered,
    totalTokens,
    truncated,
  } = filterArtifacts(role, phase, artifacts, availableBudget);

  if (filtered.length === 0) {
    return { prompt, artifacts: [], injected: false, reason: 'No relevant artifacts' };
  }

  const contextHeader = '\n\n## Context from prior phases\n';
  const contextBody = filtered
    .map((a) => {
      const kind = a.kind || a.type || 'artifact';
      const title = a.title || a.summary || 'Untitled';
      const content = a.content || JSON.stringify(a);
      return `[${kind}] ${title}:\n${content}`;
    })
    .join('\n\n');

  const injectedPrompt = prompt + contextHeader + contextBody;

  return {
    prompt: injectedPrompt,
    artifacts: filtered,
    injected: true,
    totalContextTokens: totalTokens,
    truncated,
  };
}

/**
 * Check if content fits within a token budget.
 */
function fitsBudget(content, budget) {
  return countTokens(content) <= budget;
}

module.exports = {
  countTokens,
  countTokensForObject,
  filterArtifacts,
  produceSummaryHandoff,
  injectContext,
  fitsBudget,
  DEFAULT_TOKEN_BUDGET: 8000,
  SUMMARY_HANDOVER_MAX_TOKENS: 350,
};
