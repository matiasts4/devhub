/**
 * Shared type definitions for CommandBar.
 * 
 * These types are expressed as JSDoc @typedef declarations to match
 * the codebase's JavaScript-with-JSDoc convention.
 * 
 * @module commandBar/types
 */

/**
 * A resolved intent from the intent router.
 * 
 * @typedef {Object} ResolvedIntent
 * @property {'terminal-run'|'browser-navigate'|'browser-search'|'terminal-read'|'unknown'} intent - The classified intent type
 * @property {Record<string, string>} slots - Extracted slot values (e.g., { command: "npm test", terminalName: "build" })
 * @property {number} [confidence] - Optional confidence score (0-1) for LLM-based routers
 */

/**
 * Action execution status emitted during the action lifecycle.
 * 
 * @typedef {Object} ActionStatus
 * @property {'queued'|'running'|'done'|'failed'} phase - Current execution phase
 * @property {string} [surfaceId] - ID of the spawned/focused surface (terminal or browser)
 * @property {TerminalReadResult} [result] - Read result for terminal-read actions
 * @property {string} [error] - Error message if phase is 'failed'
 */

/**
 * Result of reading a terminal buffer.
 * Designed to be TTS-ready (structured, typed, with metadata).
 * 
 * @typedef {Object} TerminalReadResult
 * @property {string} text - ANSI-stripped plain text content
 * @property {string} terminalName - Resolved terminal name/label
 * @property {string} timestamp - ISO 8601 timestamp when buffer was captured
 * @property {boolean} truncated - True if output was truncated to fit max lines
 * @property {string} [error] - Error message if capture failed
 */

/**
 * Surface controller port for dependency inversion.
 * Actions never import Pizarra or fetch directly; they receive a SurfaceController.
 * 
 * @typedef {Object} SurfaceController
 * @property {function({ label?: string, initialCommand?: string }): Promise<{id: string, label: string}>} spawnTerminal - Spawn a new terminal surface
 * @property {function(string): void} focusTerminal - Focus an existing terminal by id
 * @property {function(string): {id: string, label: string}|null} findTerminalByLabel - Find terminal by label
 * @property {function(): {id: string, label: string}|null} focusedTerminal - Get currently focused terminal
 * @property {function(): Array<{id: string, label: string}>} listTerminals - List all terminal surfaces
 * @property {function({ url: string, label?: string }): Promise<{id: string}>} spawnBrowser - Spawn or navigate browser surface
 * @property {function(string): void} focusBrowser - Focus an existing browser by id
 * @property {function(): {id: string, url: string}|null} findBrowser - Find most-recently-focused browser shape
 * @property {function(string, Object): void} updateElement - Update an element's properties (e.g., change URL)
 * @property {function(string): Promise<string>} captureTerminal - Capture terminal output (raw history string)
 */
