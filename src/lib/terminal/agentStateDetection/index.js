/**
 * agentStateDetection — herdr-style terminal output detection for DevHub agents.
 */

export { detectAgentState, hasManifest, normalizeAgentType, loadManifest } from './detector.js';
export { AgentStateMachine } from './stateMachine.js';
export { evaluateManifest, getRegion, evaluateGate } from './ruleEngine.js';
