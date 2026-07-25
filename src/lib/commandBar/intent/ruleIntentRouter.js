/**
 * Rule-based intent router implementation.
 *
 * Uses ordered first-match-wins regex patterns to classify user input
 * into action types. Deterministic and unit-testable.
 *
 * @module commandBar/intent/ruleIntentRouter
 */

/**
 * Create a rule-based intent router.
 *
 * @returns {import('./IntentRouter').IntentRouter} Intent router instance
 */
export function createRuleIntentRouter() {
  return {
    resolveIntent(input) {
      // Normalize input
      const trimmed = input.trim();
      if (!trimmed) {
        return { intent: 'unknown', slots: {} };
      }

      const lower = trimmed.toLowerCase();

      // ── Rule 1: Multi-step guard (runs first) ─────────────────────────────
      // Reject inputs with discrete-action conjunctions (AND-then logic)
      const multiStepPatterns = [
        /\band\s+then\b/i,
        /;\s*then\b/i,
        /\band\s+open\b/i,
        /\band\s+run\b/i,
        /\band\s+exec/i,
        /\band\s+search\b/i,
        /\band\s+navigate\b/i,
      ];

      for (const pattern of multiStepPatterns) {
        if (pattern.test(lower)) {
          return {
            intent: 'unknown',
            slots: { reason: 'multi-step' },
          };
        }
      }

      // ── Rule 2: terminal-read ──────────────────────────────────────────────
      // "read terminal build-output"
      // "show terminal logs"
      // "what does terminal dev-server say"
      const terminalReadPatterns = [
        /^(read|show|what\s+does)\s+.*\bterminal\b\s+(?<name>\S+)/i,
        /\bterminal\b\s+(?<name>\S+)\s+(show|output|buffer)/i,
      ];

      for (const pattern of terminalReadPatterns) {
        const match = lower.match(pattern);
        if (match?.groups?.name) {
          return {
            intent: 'terminal-read',
            slots: { terminalName: match.groups.name },
          };
        }
      }

      // ── Rule 3: browser-search ─────────────────────────────────────────────
      // "search for typescript docs"
      // "google react hooks"
      // "look up jest mocking"
      const browserSearchPattern = /^(search|google|look\s+up|find)\s+(for\s+)?(?<query>.+)/i;
      const searchMatch = lower.match(browserSearchPattern);
      if (searchMatch?.groups?.query) {
        return {
          intent: 'browser-search',
          slots: { query: searchMatch.groups.query.trim() },
        };
      }

      // ── Rule 4: browser-navigate ───────────────────────────────────────────
      // "open github.com"
      // "go to localhost:3000"
      // "navigate to https://example.com"
      //
      // URL-likeness gate: must contain a dot/TLD or a scheme to prevent
      // "open terminal" from routing to browser
      const browserNavigatePattern = /^(open|go\s+to|navigate\s+to|visit|browse)\s+(?<url>\S+)/i;
      const navMatch = lower.match(browserNavigatePattern);
      if (navMatch?.groups?.url) {
        const url = navMatch.groups.url;
        // URL-likeness test: has dot (domain.com) or scheme (http://)
        const isUrlLike = url.includes('.') || url.includes('://') || url.includes('localhost');

        // Explicit rejection: if "terminal" keyword is present, don't route to browser
        if (lower.includes('terminal')) {
          // Fall through to terminal-run or unknown
        } else if (isUrlLike) {
          return {
            intent: 'browser-navigate',
            slots: { url },
          };
        }
      }

      // ── Rule 5: terminal-run ───────────────────────────────────────────────
      // "run npm test"
      // "exec git status"
      // "execute docker ps"
      // "$ pnpm dev"
      // "run npm build in build-output"
      // "run git log in terminal git-workspace"

      const terminalRunPattern =
        /^(run|exec|execute|\$)\s+(?<command>.+?)(\s+in\s+(terminal\s+)?(?<terminalName>\S+))?$/i;
      const runMatch = trimmed.match(terminalRunPattern);
      if (runMatch?.groups?.command) {
        const slots = { command: runMatch.groups.command.trim() };
        if (runMatch.groups.terminalName) {
          slots.terminalName = runMatch.groups.terminalName;
        }
        return {
          intent: 'terminal-run',
          slots,
        };
      }

      // Fallback: if input looks like a shell command (starts with common CLI verbs or has shell operators)
      // treat it as terminal-run even without explicit "run" prefix
      const shellCommandPatterns = [
        /^(npm|pnpm|yarn|git|docker|make|cargo|go|python|node|deno)\s+/i,
        /[|&;]/, // has pipes, background, or command separators
      ];

      for (const pattern of shellCommandPatterns) {
        if (pattern.test(trimmed)) {
          return {
            intent: 'terminal-run',
            slots: { command: trimmed },
          };
        }
      }

      // ── Default: unknown ───────────────────────────────────────────────────
      return {
        intent: 'unknown',
        slots: {},
      };
    },
  };
}
