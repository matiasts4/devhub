/**
 * Classifies MCP output strings by type based on content prefix.
 * Used by MCPAccordion to determine styling (error/success/info).
 */
export function detectMcpOutput(content) {
  if (content.startsWith('[Error del Sistema')) {
    return { type: 'error', icon: '⚠️', defaultOpen: true };
  }
  if (content.startsWith('[Respuesta del Sistema')) {
    return { type: 'success', icon: '✅', defaultOpen: false };
  }
  return { type: 'info', icon: 'ℹ️', defaultOpen: false };
}
