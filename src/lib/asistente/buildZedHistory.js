/**
 * Flatten Zed overlay messages for POST /api/assistant/chat.
 * Preserves tool context as structured synthetic turns (Phase 3).
 *
 * @param {Array} messages
 * @param {number} maxLen
 * @returns {Array}
 */
export function buildZedHistory(messages, maxLen = 20) {
  if (!Array.isArray(messages)) return [];
  const flat = [];
  for (const m of messages.slice(-maxLen)) {
    if (!m || typeof m !== 'object') continue;
    if (m.role === 'user' && typeof m.content === 'string') {
      flat.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      if (typeof m.content === 'string' && m.content.trim()) {
        flat.push({ role: 'assistant', content: m.content });
      }
      if (Array.isArray(m.tool_results) && m.tool_results.length > 0) {
        const summary = m.tool_results
          .map((r) => {
            if (!r?.tool) return null;
            const resultStr =
              typeof r.result === 'string' ? r.result : JSON.stringify(r.result ?? null);
            return `[tool:${r.tool}] ${resultStr}`;
          })
          .filter(Boolean)
          .join('\n');
        if (summary) {
          flat.push({
            role: 'user',
            content: `Previous tool results from assistant turn:\n${summary}`,
          });
        }
      }
    }
  }
  return flat;
}
