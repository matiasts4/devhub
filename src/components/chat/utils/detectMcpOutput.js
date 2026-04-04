/**
 * Classifies MCP output strings by type based on content prefix.
 * Used by MCPAccordion to determine styling (error/success/info).
 * Returns a Lucide icon name string for the consumer to render.
 */
export function detectMcpOutput(content) {
  if (content.startsWith('[Error del Sistema')) {
    return { type: 'error', icon: 'AlertTriangle', defaultOpen: true };
  }
  if (content.startsWith('[Respuesta del Sistema')) {
    return { type: 'success', icon: 'CheckCircle2', defaultOpen: false };
  }
  return { type: 'info', icon: 'Info', defaultOpen: false };
}
