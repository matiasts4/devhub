/**
 * State machine for parsing <execute_*> tags during streaming.
 * Replaces regex-based formatMessage() to eliminate flicker on partial tags.
 *
 * States: IDLE → TAG_OPENING → INSIDE_TAG → TAG_CLOSING → COMPLETE
 *
 * Usage:
 *   const parser = createTagParser();
 *   parser.feed(chunk);
 *   const { display, toolName, state } = parser.getState();
 */

const STATES = {
  IDLE: 'IDLE',
  TAG_OPENING: 'TAG_OPENING',
  INSIDE_TAG: 'INSIDE_TAG',
  TAG_CLOSING: 'TAG_CLOSING',
  COMPLETE: 'COMPLETE',
};

export function createTagParser() {
  let state = STATES.IDLE;
  let buffer = '';
  let toolName = '';
  let toolArgs = '';
  let toolType = ''; // 'opencode' or 'engram'
  let tagContent = '';
  let pendingBeforeTag = '';

  return {
    /**
     * Feed a chunk of text into the parser.
     * Returns the display string for the current state.
     */
    feed(chunk) {
      buffer += chunk;

      // Check for complete open tags first
      const openMatch = buffer.match(/<(execute_opencode|execute_engram)([^>]*)>/);
      if (openMatch && state === STATES.IDLE) {
        const beforeTag = buffer.slice(0, openMatch.index);
        pendingBeforeTag += beforeTag;
        toolType = openMatch[1].replace('execute_', '');
        const attrs = openMatch[2];

        // Extract tool name from attributes
        if (toolType === 'opencode') {
          const agentMatch = attrs.match(/agent="([^"]+)"/);
          toolName = agentMatch ? agentMatch[1] : 'unknown';
        } else if (toolType === 'engram') {
          const toolMatch = attrs.match(/tool="([^"]+)"/);
          toolName = toolMatch ? toolMatch[1] : 'unknown';
          const argsMatch = attrs.match(/args='([^']*)'/);
          toolArgs = argsMatch ? argsMatch[1] : '';
        }

        // Check if closing tag is also in buffer
        const closeTag = `</${openMatch[1]}>`;
        const afterOpen = buffer.slice(openMatch.index + openMatch[0].length);
        const closeIndex = afterOpen.indexOf(closeTag);

        if (closeIndex !== -1) {
          // Complete tag found — extract content and move past it
          tagContent = afterOpen.slice(0, closeIndex);
          const afterClose = afterOpen.slice(closeIndex + closeTag.length);
          buffer = afterClose;
          state = STATES.COMPLETE;
          pendingBeforeTag += this._formatCompleteTag();
          return pendingBeforeTag;
        } else {
          // Partial tag — show loading state
          state = STATES.INSIDE_TAG;
          // Keep the rest of the buffer for next feed
          buffer = afterOpen;
          return pendingBeforeTag + this._formatLoading();
        }
      }

      // Check for partial open tag (still being streamed)
      const partialOpen = buffer.match(/<execute_(opencode|engram)?/);
      if (partialOpen && state === STATES.IDLE) {
        const beforePartial = buffer.slice(0, partialOpen.index);
        pendingBeforeTag += beforePartial;
        state = STATES.TAG_OPENING;
        buffer = partialOpen[0];
        return pendingBeforeTag + '> *Generando ejecución de sub-sistema...*\n\n';
      }

      // If inside a tag, check for closing
      if (state === STATES.INSIDE_TAG || state === STATES.TAG_OPENING) {
        const currentTag = toolType ? `execute_${toolType}` : 'execute_opencode';
        const closeTag = `</${currentTag}>`;
        const closeIndex = buffer.indexOf(closeTag);

        if (closeIndex !== -1) {
          tagContent = buffer.slice(0, closeIndex);
          const afterClose = buffer.slice(closeIndex + closeTag.length);
          buffer = afterClose;
          state = STATES.COMPLETE;
          pendingBeforeTag += this._formatCompleteTag();
          return pendingBeforeTag;
        }

        // Still inside tag — keep showing loading
        return pendingBeforeTag + this._formatLoading();
      }

      // IDLE state — just accumulate text
      pendingBeforeTag += buffer;
      buffer = '';
      return pendingBeforeTag;
    },

    getState() {
      return { state, toolName, toolArgs, toolType, tagContent };
    },

    reset() {
      state = STATES.IDLE;
      buffer = '';
      toolName = '';
      toolArgs = '';
      toolType = '';
      tagContent = '';
      pendingBeforeTag = '';
    },

    /**
     * Format a complete execute tag into display markdown.
     */
    _formatCompleteTag() {
      if (toolType === 'opencode') {
        return `\n\n> **▶ Dispatching Sub-Agent**: \`${toolName}\`\n> \n> **Instructions:** ${tagContent}\n\n`;
      } else if (toolType === 'engram') {
        return `\n\n> **◈ Accediendo a Memoria (Engram MCP)**\n> \n> **Herramienta:** \`${toolName}\`\n> **Argumentos:** \`${toolArgs}\`\n\n`;
      }
      return '';
    },

    /**
     * Format loading state for display.
     */
    _formatLoading() {
      if (toolType === 'opencode') {
        return `\n\n> *Preparando Sub-Agente...*\n> \n> **Agente:** \`${toolName}\`\n\n`;
      } else if (toolType === 'engram') {
        return `\n\n> *Engram MCP contactando...*\n> \n> **Herramienta:** \`${toolName}\`\n\n`;
      }
      return '\n\n> *Generando ejecución de sub-sistema...*\n\n';
    },
  };
}
