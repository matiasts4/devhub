/**
 * Server-side Engram client for Zed (ESM wrapper around the OpenCode MCP proxy).
 *
 * All calls are best-effort: failures are logged and swallowed so Engram
 * availability never blocks the chat flow.
 */

const DEFAULT_PORT = 4154;

function getEngramUrl() {
  const port = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : DEFAULT_PORT;
  const base = process.env.OPENCODE_URL || `http://127.0.0.1:${port}`;
  return `${base}/mcp/engram/call`;
}

async function callEngramTool(toolName, args = {}) {
  const response = await fetch(getEngramUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolName, args }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 404) {
      throw new Error(
        `MCP client 'engram' not found in OpenCode. Ensure it is configured and connected.`
      );
    }
    throw new Error(`OpenCode Engram MCP error (${response.status}): ${text}`);
  }

  const result = await response.json();

  if (result.isError) {
    throw new Error(result.content?.[0]?.text || 'Engram MCP returned error');
  }

  return result;
}

function sanitizeMemoryContent(content) {
  if (typeof content !== 'string') return String(content ?? '');
  return content
    .replace(/\b(sk-|pk-|Bearer\s+|api[_-]?key[:=]\s*)[^\s\n]+/gi, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_]{32,64}\b/g, (match) =>
      /^(?:[A-Fa-f0-9]{32,64})$/.test(match) ? '[REDACTED]' : match
    );
}

function isTestEnvironment() {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export async function saveZedMemoryServer({
  title,
  type = 'interaction',
  content,
  project,
  topic_key,
} = {}) {
  if (!title || !content) return { success: false, content: 'missing title or content' };
  if (isTestEnvironment()) return { success: true, content: 'test-skip' };
  try {
    await callEngramTool('mem_save', {
      title,
      type,
      content: sanitizeMemoryContent(content),
      scope: project ? 'project' : 'project',
      ...(topic_key ? { topic_key } : {}),
      ...(project ? { project } : {}),
    });
    return { success: true, content: `Saved: ${title}` };
  } catch (err) {
    console.warn('[zedEngramServer] mem_save failed:', err.message);
    return { success: false, content: err.message };
  }
}

export async function searchZedMemoriesServer({
  query,
  project,
  scope = 'project',
  limit = 5,
} = {}) {
  if (!query) return { success: false, content: '', memories: [] };
  if (isTestEnvironment()) return { success: true, content: '', memories: [] };
  try {
    const result = await callEngramTool('mem_search', {
      query,
      scope,
      limit,
      ...(project ? { project } : {}),
    });
    const text = result.content?.[0]?.text || '';
    let memories = [];
    try {
      const parsed = JSON.parse(text);
      memories = Array.isArray(parsed) ? parsed : parsed?.memories || parsed?.results || [];
    } catch {
      memories = text.split('\n').filter((line) => line.trim());
    }
    return { success: true, content: text, memories };
  } catch (err) {
    console.warn('[zedEngramServer] mem_search failed:', err.message);
    return { success: false, content: err.message, memories: [] };
  }
}

export async function saveZedSessionSummaryServer({ content, session_id } = {}) {
  if (!content) return { success: false, content: 'missing content' };
  try {
    await callEngramTool('mem_session_summary', {
      content: sanitizeMemoryContent(content),
      ...(session_id ? { session_id } : {}),
    });
    return { success: true, content: 'Session summary saved' };
  } catch (err) {
    console.warn('[zedEngramServer] mem_session_summary failed:', err.message);
    return { success: false, content: err.message };
  }
}

export default {
  saveZedMemoryServer,
  searchZedMemoriesServer,
  saveZedSessionSummaryServer,
};
