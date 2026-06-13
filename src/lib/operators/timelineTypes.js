/**
 * @fileoverview JSDoc type aliases for the Operator Execution Timeline.
 * Documents the canonical shapes defined in OET-1, OET-7, and D-5.
 * These are documentation-only — no runtime type checking.
 *
 * @module lib/operators/timelineTypes
 * @see OET-1  Timeline Event Schema
 * @see OET-7  Execution Aggregate and Status Rollup
 * @see D-5    SSE Contract (TimelineSSEEvent)
 */

/**
 * @typedef {'action_request'|'policy_evaluation'|'tool_invocation'|'execution_progress'|'rollback'|'deferred'|'audit_recorded'} Stage
 */

/**
 * @typedef {'requested'|'policy_approved'|'policy_denied'|'invoked'|'running'|'completed'|'failed'|'rolled_back'|'deferred'} Status
 */

/**
 * @typedef {'primary'|'secondary_hint'} Authority
 */

/**
 * @typedef {'none'|'params_only'|'full'} RedactionLevel
 */

/**
 * Single entry in the operator execution timeline.
 * @typedef {Object} OperatorTimelineItem
 * @property {string} item_id - UUID v4 primary key; stable across retries
 * @property {string} execution_id - Groups all items in one operator action
 * @property {string} correlation_id - Links operator intent to downstream spans
 * @property {number} sequence - Monotonic integer, 1-indexed, per execution_id
 * @property {{ type: 'human'|'operator'|'director'|'system', id: string, role: string }} actor
 * @property {Stage} stage - Current processing stage (OET-2)
 * @property {Status} status - Current status (OET-3)
 * @property {string|null} tool - MCP tool name when stage === 'tool_invocation'
 * @property {object|null} params - Tool params; always redaction-processed before storage
 * @property {string[]} evidence_refs - Durable record ids (mission_message id, run id, etc.)
 * @property {RedactionLevel} redaction_level
 * @property {string} occurred_at - ISO 8601 UTC; server clock, never client-supplied
 * @property {Authority} authority - 'primary' = durable; 'secondary_hint' = not yet persisted
 * @property {string|null} next_step_hint - Human-readable next expected stage
 * @property {{ code: string, message: string, recoverable: boolean }|null} error
 */

/**
 * Execution-level rollup summarizing all timeline items for one execution_id.
 * @typedef {Object} ExecutionSummary
 * @property {string} execution_id
 * @property {string} correlation_id
 * @property {{ type: string, id: string, role: string }} actor
 * @property {string} current_status - Latest non-deferred status across all items
 * @property {'completed'|'failed'|'rolled_back'|null} terminal_status
 * @property {number} item_count - Total timeline items for this execution
 * @property {string} last_item_at - ISO 8601; occurred_at of most recent item
 * @property {boolean} pending_confirmation - true if any item has stage='deferred'
 */

/**
 * SSE event envelope sent by the stream endpoint.
 * Emitted for every new timeline item and on heartbeat.
 * @typedef {Object} TimelineSSEEvent
 * @property {'timeline_item'|'execution_rollup'|'heartbeat'} type
 * @property {string} execution_id
 * @property {OperatorTimelineItem} [item] - Present when type === 'timeline_item'
 * @property {ExecutionSummary} [rollup] - Present when type === 'execution_rollup'
 * @property {Authority} authority
 * @property {number} last_durable_sequence - Highest confirmed sequence from SQLite
 * @property {string} occurred_at - ISO 8601 UTC; server clock
 */

module.exports = {};