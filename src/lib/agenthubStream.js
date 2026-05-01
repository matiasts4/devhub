export function createAgentHubStreamParser({ onEvent, onMalformedLine } = {}) {
  let buffer = '';

  const emitLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const event = JSON.parse(trimmed);
      onEvent?.(event);
    } catch {
      onMalformedLine?.(trimmed);
    }
  };

  return {
    push(chunk) {
      if (!chunk) return;

      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        emitLine(line);
      }
    },

    flush() {
      emitLine(buffer);
      buffer = '';
    },
  };
}
