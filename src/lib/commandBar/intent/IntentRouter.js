/**
 * Intent Router interface definition.
 * 
 * The IntentRouter interface provides a seam for swapping routing implementations
 * (rule-based vs LLM-based) without changing the action layer.
 * 
 * @module commandBar/intent/IntentRouter
 */

/**
 * Intent router interface.
 * 
 * Implementations must provide a resolveIntent method that classifies
 * user input into an action type and extracts relevant slots.
 * 
 * @typedef {Object} IntentRouter
 * @property {function(string): import('../types').ResolvedIntent} resolveIntent - Resolve user input to an intent
 */

// This file only exports the typedef; implementations live in separate files
// (e.g., ruleIntentRouter.js, llmIntentRouter.js)
