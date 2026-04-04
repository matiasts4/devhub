import { useState } from 'react';
import {
  ChevronDown,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Info,
  Copy,
  Check,
  Database,
} from 'lucide-react';
import { detectMcpOutput } from './utils/detectMcpOutput';

// Configuración por tipo
const typeConfig = {
  error: {
    dotColor: '#f87171',
    labelColor: 'var(--status-danger, #f87171)',
    bgColor: 'rgba(248,113,113,0.08)',
    borderColor: 'rgba(248,113,113,0.25)',
    label: 'MCP Error',
    icon: AlertTriangle,
  },
  success: {
    dotColor: '#f59e0b',
    labelColor: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.06)',
    borderColor: 'rgba(245,158,11,0.2)',
    label: 'Engram',
    icon: Database,
  },
  info: {
    dotColor: 'var(--accent-primary)',
    labelColor: 'var(--accent-primary)',
    bgColor: 'color-mix(in srgb, var(--accent-primary) 6%, transparent)',
    borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
    label: 'Sistema MCP',
    icon: Info,
  },
};

/**
 * TerminalContent — renderiza el contenido con syntax coloring.
 */
function TerminalContent({ content }) {
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer"
        style={{
          color: copied ? '#34d399' : 'var(--text-muted)',
          background: 'color-mix(in srgb, var(--surface-elevated) 80%, transparent)',
          border: '1px solid var(--border-subtle)',
        }}
        title="Copiar"
      >
        {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>

      <pre
        className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words overflow-x-auto p-3 pr-16"
        style={{ color: 'var(--text-secondary)' }}
      >
        {lines.map((line, i) => (
          <div key={i}>
            {line.startsWith('**') && line.endsWith('**') ? (
              <span className="text-emerald-400 font-semibold">{line.slice(2, -2)}</span>
            ) : line.startsWith('- ') ? (
              <>
                <span style={{ color: 'var(--accent-primary)' }} className="mr-1">→</span>
                <span>{line.slice(2)}</span>
              </>
            ) : line.match(/^\d+\./) ? (
              <>
                <span className="text-amber-400 mr-1">#{line.match(/^(\d+)/)?.[1]}</span>
                <span>{line.replace(/^\d+\.\s*/, '')}</span>
              </>
            ) : line.includes('✅') || line.includes('✓') ? (
              <span className="text-emerald-400">{line}</span>
            ) : line.includes('❌') || line.includes('✗') || line.includes('ERROR') ? (
              <span className="text-red-400">{line}</span>
            ) : line.includes('⚠') || line.includes('WARNING') ? (
              <span className="text-amber-400">{line}</span>
            ) : (
              <span>{line}</span>
            )}
          </div>
        ))}
      </pre>
    </div>
  );
}

/**
 * MCPAccordion — pill compacto estilo OpenCode para responses de herramientas MCP.
 * Collapsed por defecto, expandible con transición.
 */
export default function MCPAccordion({ content, defaultOpen, className = '' }) {
  const [open, setOpen] = useState(defaultOpen !== undefined ? defaultOpen : false);
  const { type } = detectMcpOutput(content);
  const config = typeConfig[type] || typeConfig.info;
  const Icon = config.icon;

  // Limpiar el prefijo [Sistema Engram]: del contenido
  const cleanContent = content
    .replace(/^\[(?:Respuesta|Error) del Sistema Engram\]:\n?/, '')
    .trim();

  // Primera línea como preview
  const previewLine = cleanContent.split('\n')[0]?.trim().slice(0, 80) || '';
  const hasMoreLines = cleanContent.split('\n').length > 1 || cleanContent.length > 80;

  return (
    <div className={`w-full ${className}`}>
      {/* ── Pill header — siempre visible ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left py-1 px-0 group/mcp"
      >
        {/* Dot de color */}
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: config.dotColor }}
        />

        {/* Icon */}
        <Icon
          className="w-3 h-3 flex-shrink-0"
          style={{ color: config.labelColor }}
        />

        {/* Label */}
        <span
          className="text-[10px] font-bold uppercase tracking-widest flex-shrink-0 font-mono"
          style={{ color: config.labelColor }}
        >
          {config.label}
        </span>

        {/* Separator */}
        <span className="text-[11px]" style={{ color: 'var(--border-strong)' }}>→</span>

        {/* Preview text */}
        <span
          className="text-[11px] font-mono truncate flex-1"
          style={{ color: 'var(--text-muted)' }}
        >
          {previewLine}
        </span>

        {/* Chevron */}
        {hasMoreLines && (
          <ChevronDown
            className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 opacity-40 group-hover/mcp:opacity-70 ${open ? 'rotate-180' : ''}`}
            style={{ color: 'var(--text-muted)' }}
          />
        )}
      </button>

      {/* ── Expanded content ── */}
      <div
        className={`grid transition-all duration-200 ${open ? 'grid-rows-[1fr] mt-1' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div
            className="rounded-md overflow-hidden ml-3"
            style={{
              background: config.bgColor,
              border: `1px solid ${config.borderColor}`,
            }}
          >
            <TerminalContent content={cleanContent} />
          </div>
        </div>
      </div>
    </div>
  );
}
