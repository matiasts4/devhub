/**
 * Flatten Zed overlay messages for POST /api/assistant/chat.
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
    } else if (m.role === 'assistant' && typeof m.content === 'string') {
      flat.push({ role: 'assistant', content: m.content });
      if (Array.isArray(m.tool_results)) {
        for (const r of m.tool_results) {
          if (!r || !r.tool) continue;
          flat.push({
            role: 'user',
            content: `Tool ${r.tool} result: ${JSON.stringify(r.result ?? null)}`,
          });
        }
      }
    }
  }
  return flat;
}