/**
 * Zed long-term memory client via the DevHub Engram MCP proxy.
 *
 * All calls are best-effort: failures are logged and swallowed so Engram
 * availability never blocks the chat flow.
 */

const ENGRAM_PROXY = '/api/mcp/engram';

const ENGRAM_TIMEOUT_MS = 2000;

async function callEngramProxy(toolName, args = {}) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ENGRAM_TIMEOUT_MS);

    const response = await fetch(ENGRAM_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName, args }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Engram proxy HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.content || 'Engram tool returned failure');
    }
    return data;
  } catch (err) {
    // Best-effort: never fail the chat flow because of Engram.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[zedEngram] ${toolName} failed:`, err.message);
    }
    return { success: false, content: '', error: err.message };
  }
}

function sanitizeMemoryContent(content) {
  if (typeof content !== 'string') return String(content ?? '');
  // Redact common secret-looking strings.
  return content
    .replace(/\b(sk-|pk-|Bearer\s+|api[_-]?key[:=]\s*)[^\s\n]+/gi, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_]{32,64}\b/g, (match) =>
      /^(?:[A-Fa-f0-9]{32,64})$/.test(match) ? '[REDACTED]' : match
    );
}

/**
 * Save a semantic memory (observation) to Engram.
 */
export async function saveZedMemory({
  title,
  type = 'interaction',
  content,
  project,
  topic_key,
  capture_prompt = false,
} = {}) {
  if (!title || !content) return { success: false, content: 'missing title or content' };
  const safeContent = sanitizeMemoryContent(content);
  return callEngramProxy('mem_save', {
    title,
    type,
    content: safeContent,
    scope: project ? 'project' : 'project',
    ...(topic_key ? { topic_key } : {}),
    ...(capture_prompt !== undefined ? { capture_prompt } : {}),
    ...(project ? { project } : {}),
  });
}

/**
 * Search long-term memories relevant to a query.
 */
export async function searchZedMemories({ query, project, scope = 'project', limit = 5 } = {}) {
  if (!query) return { success: false, content: '', memories: [] };
  const result = await callEngramProxy('mem_search', {
    query,
    scope,
    limit,
    ...(project ? { project } : {}),
  });
  if (!result.success) return { ...result, memories: [] };
  // Engram may return JSON or plain text; attempt to parse it.
  let memories = [];
  try {
    const parsed = JSON.parse(result.content);
    memories = Array.isArray(parsed) ? parsed : parsed?.memories || parsed?.results || [];
  } catch {
    memories = result.content
      ? result.content.split('\n').filter((line) => line.trim())
      : [];
  }
  return { ...result, memories };
}

/**
 * Save a session summary to Engram.
 */
export async function saveZedSessionSummary({ content, session_id } = {}) {
  if (!content) return { success: false, content: 'missing content' };
  return callEngramProxy('mem_session_summary', {
    content: sanitizeMemoryContent(content),
    ...(session_id ? { session_id } : {}),
  });
}

/**
 * Extract simple entities from a user message to improve Engram recall.
 */
export function extractZedMemoryEntities(message) {
  const text = typeof message === 'string' ? message : '';
  const entities = {
    projects: [],
    tasks: [],
    agents: [],
    tools: [],
  };

  const projectMatches = text.match(/\b(proyecto|project)\s+['"]?([A-Za-z0-9_-]+)['"]?/gi);
  if (projectMatches) {
    entities.projects = projectMatches.map((m) => m.replace(/^.*?\s+/, '').replace(/['"]/g, ''));
  }

  const taskMatches = text.match(/\b(tarea|task|issue)\s+#?(\d+)/gi);
  if (taskMatches) {
    entities.tasks = taskMatches.map((m) => m.replace(/^.*?\s+/, '').replace('#', ''));
  }

  const agentMatches = text.match(/\b(agente|agent|swarm)\s+['"]?([A-Za-z0-9_-]+)['"]?/gi);
  if (agentMatches) {
    entities.agents = agentMatches.map((m) => m.replace(/^.*?\s+/, '').replace(/['"]/g, ''));
  }

  const toolMatches = text.match(/\b(open_terminal|execute_in_terminal|open_url|list_terminals|review_terminal_output|create_task|create_milestone)\b/g);
  if (toolMatches) {
    entities.tools = [...new Set(toolMatches)];
  }

  return entities;
}

export default {
  saveZedMemory,
  searchZedMemories,
  saveZedSessionSummary,
  extractZedMemoryEntities,
};
