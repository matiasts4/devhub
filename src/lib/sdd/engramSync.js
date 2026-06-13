/**
 * @module engramSync
 * Engram MCP integration for cross-session persistence.
 * Proxies calls to the running OpenCode MCP server via /api/mcp/engram.
 */

'use strict';

// ---------------------------------------------------------------------------
// Engram MCP proxy
// ---------------------------------------------------------------------------

/**
 * Call an Engram MCP tool via the DevHub proxy route.
 * @param {string} toolName - Engram tool name (e.g. 'mem_save', 'mem_search')
 * @param {object} args - Tool arguments
 * @returns {Promise<object>} Tool result
 */
async function callEngramTool(toolName, args = {}) {
  const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4154;
  const SERVER_URL = process.env.OPENCODE_URL || `http://127.0.0.1:${SERVER_PORT}`;

  const response = await fetch(`${SERVER_URL}/mcp/engram/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolName, args }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 404) {
      throw new Error(`MCP client 'engram' not found in OpenCode. Ensure it is configured and connected.`);
    }
    throw new Error(`OpenCode Engram MCP error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (result.isError) {
    throw new Error(result.content?.[0]?.text || 'Engram MCP returned error');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API — mirrors Engram MCP tools used by SessionPersistence
// ---------------------------------------------------------------------------

/**
 * Save an observation to Engram.
 * Used by SessionPersistence.syncSessionToEngram() for cross-session recall.
 *
 * @param {object} args - mem_save arguments
 * @param {string} args.title - Observation title
 * @param {string} [args.type='architecture'] - Observation type
 * @param {string} [args.content] - Observation content
 * @param {string} [args.project] - Project scope
 * @param {string} [args.topic_key] - Topic key for upsert
 * @param {boolean} [args.capture_prompt=false] - Capture user prompt
 * @returns {Promise<{success: boolean, content: string}>}
 */
async function engram_mem_save({
  title,
  type = 'architecture',
  content = '',
  project,
  topic_key,
  capture_prompt = false,
} = {}) {
  try {
    const args = {
      title,
      type,
      content,
      scope: project ? 'project' : 'project',
      ...(topic_key ? { topic_key } : {}),
      ...(capture_prompt !== undefined ? { capture_prompt } : {}),
    };

    await callEngramTool('mem_save', args);

    return {
      success: true,
      content: `Saved: ${title}`,
    };
  } catch (err) {
    // Engram sync is best-effort — never fail the calling operation
    console.warn('[engramSync] mem_save failed:', err.message);
    return {
      success: false,
      content: `Engram sync failed: ${err.message}`,
    };
  }
}

/**
 * Search Engram observations.
 * @param {object} args - mem_search arguments
 * @param {string} args.query - Search query
 * @param {string} [args.project] - Filter by project
 * @param {string} [args.scope='project'] - Scope filter
 * @param {number} [args.limit=10] - Max results
 * @returns {Promise<{success: boolean, content: string}>}
 */
async function engram_mem_search({
  query,
  project,
  scope = 'project',
  limit = 10,
} = {}) {
  try {
    const args = {
      query,
      project,
      scope,
      limit,
    };

    const result = await callEngramTool('mem_search', args);

    return {
      success: true,
      content: result.content?.[0]?.text || '',
      raw: result,
    };
  } catch (err) {
    console.warn('[engramSync] mem_search failed:', err.message);
    return {
      success: false,
      content: `Engram search failed: ${err.message}`,
    };
  }
}

/**
 * Get a single Engram observation by ID.
 * @param {object} args - mem_get_observation arguments
 * @param {number} args.id - Observation ID
 * @returns {Promise<{success: boolean, content: string}>}
 */
async function engram_mem_get_observation({ id } = {}) {
  try {
    const result = await callEngramTool('mem_get_observation', { id });

    return {
      success: true,
      content: result.content?.[0]?.text || '',
      raw: result,
    };
  } catch (err) {
    console.warn('[engramSync] mem_get_observation failed:', err.message);
    return {
      success: false,
      content: `Engram get failed: ${err.message}`,
    };
  }
}

/**
 * Save session summary to Engram.
 * Used for end-of-session persistence.
 * @param {object} args - mem_session_summary arguments
 * @param {string} args.content - Session summary content
 * @param {string} [args.session_id] - Session identifier
 * @returns {Promise<{success: boolean, content: string}>}
 */
async function engram_mem_session_summary({
  content,
  session_id,
} = {}) {
  try {
    const args = {
      content,
      ...(session_id ? { session_id } : {}),
    };

    await callEngramTool('mem_session_summary', args);

    return {
      success: true,
      content: 'Session summary saved',
    };
  } catch (err) {
    console.warn('[engramSync] mem_session_summary failed:', err.message);
    return {
      success: false,
      content: `Engram session summary failed: ${err.message}`,
    };
  }
}

module.exports = {
  engram_mem_save,
  engram_mem_search,
  engram_mem_get_observation,
  engram_mem_session_summary,
  callEngramTool,
};
