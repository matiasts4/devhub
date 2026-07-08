/**
 * Wire-format adapter between Zed's internal Anthropic-shaped conversation
 * (role: 'user'|'assistant', content: string | Array<block>) and the OpenAI
 * Chat Completions format xAI's Grok API speaks.
 *
 * Keeping the internal `conversation` array (built in route.js, mutated in
 * runZedChatLoop.js) in the Anthropic shape means the tool-loop logic stays
 * provider-agnostic — only grokClient.js/streamGrok.js touch this adapter,
 * translating to OpenAI messages right before the request and translating
 * the response straight back to Anthropic content blocks.
 */

/**
 * Sanitize JSON Schema for strict providers (xAI Grok rejects property-level
 * `required: true` booleans — only array-form `required` on object schemas).
 * @param {object} schema
 * @returns {object}
 */
export function sanitizeJsonSchemaForOpenAi(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;

  const out = { ...schema };

  // Object-level required must be string[]; drop boolean leftovers.
  if (Object.prototype.hasOwnProperty.call(out, 'required')) {
    if (Array.isArray(out.required)) {
      out.required = out.required.filter((k) => typeof k === 'string');
      if (!out.required.length) delete out.required;
    } else {
      delete out.required;
    }
  }

  if (out.properties && typeof out.properties === 'object') {
    const props = {};
    const impliedRequired = [];
    for (const [key, propSchema] of Object.entries(out.properties)) {
      if (propSchema && typeof propSchema === 'object' && !Array.isArray(propSchema)) {
        const { required: reqFlag, ...rest } = propSchema;
        if (reqFlag === true) impliedRequired.push(key);
        props[key] = sanitizeJsonSchemaForOpenAi(rest);
      } else {
        props[key] = propSchema;
      }
    }
    out.properties = props;
    if (impliedRequired.length) {
      const existing = Array.isArray(out.required) ? out.required : [];
      out.required = [...new Set([...existing, ...impliedRequired])];
    }
  }

  if (out.items && typeof out.items === 'object') {
    out.items = sanitizeJsonSchemaForOpenAi(out.items);
  }

  return out;
}

/**
 * @param {Array<{name: string, description?: string, input_schema?: object}>} anthropicTools
 * @returns {Array<{type: 'function', function: {name: string, description: string, parameters: object}}>}
 */
export function toOpenAiTools(anthropicTools = []) {
  return anthropicTools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: sanitizeJsonSchemaForOpenAi(t.input_schema || { type: 'object', properties: {} }),
    },
  }));
}

/**
 * @param {string|undefined} system
 * @param {Array<{role: 'user'|'assistant', content: string|Array<object>}>} conversation
 * @returns {Array<object>} OpenAI chat/completions `messages`
 */
export function toOpenAiMessages(system, conversation = []) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });

  for (const turn of conversation) {
    if (typeof turn.content === 'string') {
      messages.push({ role: turn.role, content: turn.content });
      continue;
    }
    if (!Array.isArray(turn.content)) continue;

    if (turn.role === 'assistant') {
      const text = turn.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('\n');
      const toolUseBlocks = turn.content.filter((b) => b.type === 'tool_use');
      const assistantMsg = { role: 'assistant', content: text || null };
      if (toolUseBlocks.length) {
        assistantMsg.tool_calls = toolUseBlocks.map((b) => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
        }));
      }
      messages.push(assistantMsg);
      continue;
    }

    // Anthropic `tool_result` blocks -> one role:'tool' message per result.
    const toolResultBlocks = turn.content.filter((b) => b.type === 'tool_result');
    if (toolResultBlocks.length) {
      for (const b of toolResultBlocks) {
        messages.push({
          role: 'tool',
          tool_call_id: b.tool_use_id,
          content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
        });
      }
      continue;
    }

    // Fallback: flatten any other block array to plain text.
    const text = turn.content.map((b) => b.text || '').join('\n');
    messages.push({ role: turn.role, content: text });
  }

  return messages;
}

/**
 * @param {{content?: string|null, tool_calls?: Array<object>}} message OpenAI `choices[0].message`
 * @returns {Array<{type: 'text', text: string}|{type: 'tool_use', id: string, name: string, input: object}>}
 */
export function fromOpenAiMessage(message = {}) {
  const content = [];
  if (message.content) {
    content.push({ type: 'text', text: message.content });
  }
  if (Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      content.push({
        id: tc.id,
        type: 'tool_use',
        name: tc.function?.name,
        input: parseToolCallArguments(tc.function?.arguments),
      });
    }
  }
  return content;
}

/**
 * @param {string|undefined} raw JSON-encoded tool-call arguments
 * @returns {object}
 */
export function parseToolCallArguments(raw) {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { _parse_error: raw };
  }
}
