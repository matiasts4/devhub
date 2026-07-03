/**
 * agentTuiMetadata.node — server-only entry point for agent TUI detection.
 *
 * Import this from Node.js code (PTY server, API routes, etc.). Never import
 * this into a Next.js client component; the `.node.js` suffix keeps it out of
 * the browser bundle and prevents server-only modules from leaking into the
 * client chunk graph.
 */

export {
  AGENT_TUI_TYPES,
  AGENT_TUI_PATTERN,
  normalizeAgentCommand,
  detectAgentTypeFromCommand,
  extractAgentSessionId,
  synthesizeAgentSessionId,
  isAgentTuiCommand,
  resolveAgentTuiLabel,
  detectAgentStateFromOutput,
  detectAgentState,
  hasManifest,
  AgentStateMachine,
} from './agentTuiMetadata.shared.js';
