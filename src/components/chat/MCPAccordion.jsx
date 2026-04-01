import { useState } from 'react';
import {
  ChevronDown,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { detectMcpOutput } from './utils/detectMcpOutput';

const typeConfig = {
  error: {
    accent: 'red',
    border: 'border-red-500/40',
    headerBg: 'bg-red-500/10',
    headerBorder: 'border-b-red-500/20',
    title: 'text-red-400',
    icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
    label: 'Error MCP',
    dot: 'bg-red-500',
    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.1)]',
  },
  success: {
    accent: 'amber',
    border: 'border-amber-500/30',
    headerBg: 'bg-amber-500/5',
    headerBorder: 'border-b-amber-500/15',
    title: 'text-amber-400',
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />,
    label: 'Engram MCP',
    dot: 'bg-amber-500',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.05)]',
  },
  info: {
    accent: 'blue',
    border: 'border-blue-500/30',
    headerBg: 'bg-blue-500/5',
    headerBorder: 'border-b-blue-500/15',
    title: 'text-blue-400',
    icon: <Info className="w-3.5 h-3.5 text-blue-400" />,
    label: 'Sistema',
    dot: 'bg-blue-500',
    glow: 'shadow-[0_0_20px_rgba(59,130,246,0.05)]',
  },
};

/**
 * Terminal-style content renderer for MCP outputs.
 * Renders raw text with line numbers, semantic colors, and monospace font.
 */
function TerminalContent({ content }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Split content into lines for terminal-style rendering
  const lines = content.split('\n');

  return (
    <div className="relative">
      {/* Copy button */}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono text-gray-500 hover:text-gray-300 bg-[#0c1018]/80 border border-[#2a3441] rounded transition-colors"
        title="Copy output"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400">Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" />
            <span>Copy</span>
          </>
        )}
      </button>

      {/* Terminal content */}
      <pre className="font-mono text-[11px] leading-relaxed text-gray-300 whitespace-pre-wrap break-words overflow-x-auto p-4 pr-20">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="text-gray-600 select-none w-8 text-right mr-4 flex-shrink-0">
              {i + 1}
            </span>
            <span className="flex-1">
              {line.startsWith('**') && line.endsWith('**') ? (
                <span className="text-emerald-400 font-semibold">{line.slice(2, -2)}</span>
              ) : line.startsWith('- ') ? (
                <>
                  <span className="text-[#5b8cff] mr-1">→</span>
                  <span>{line.slice(2)}</span>
                </>
              ) : line.match(/^\d+\./) ? (
                <>
                  <span className="text-amber-400 mr-1">#{line.match(/^(\d+)/)?.[1]}</span>
                  <span>{line.replace(/^\d+\.\s*/, '')}</span>
                </>
              ) : line.includes('✅') || line.includes('✓') ? (
                <span className="text-emerald-400">{line}</span>
              ) : line.includes('❌') ||
                line.includes('✗') ||
                line.includes('ERROR') ||
                line.includes('Error:') ? (
                <span className="text-red-400">{line}</span>
              ) : line.includes('⚠') || line.includes('WARNING') || line.includes('Warning:') ? (
                <span className="text-amber-400">{line}</span>
              ) : line.match(/^`.*`$/) ? (
                <span className="text-[#9bc2ff] bg-[#111825] px-1 rounded">{line}</span>
              ) : (
                <span>{line}</span>
              )}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

export default function MCPAccordion({ content, defaultOpen, className = '' }) {
  const [open, setOpen] = useState(defaultOpen !== undefined ? defaultOpen : false);
  const { type, icon, label } = detectMcpOutput(content);
  const config = typeConfig[type] || typeConfig.info;

  // Clean the MCP prefix from content
  const cleanContent = content.replace(/^\[.*?Sistema Engram\]:\n/, '').trim();

  return (
    <div className={`w-full ${className}`}>
      <Accordion
        type="single"
        collapsible
        value={open ? 'mcp-output' : undefined}
        onValueChange={(val) => setOpen(val === 'mcp-output')}
      >
        <AccordionItem
          value="mcp-output"
          className={`rounded-lg overflow-hidden border ${config.border} ${config.glow} transition-all`}
        >
          <AccordionTrigger
            className={`cursor-pointer px-3 py-2 ${config.headerBg} ${config.headerBorder} transition-colors select-none [&[data-state=open]>svg]:rotate-180`}
          >
            <div className="flex items-center gap-2.5">
              {/* Terminal dots */}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${config.dot}`} />
                <div className="w-2 h-2 rounded-full bg-gray-600" />
                <div className="w-2 h-2 rounded-full bg-gray-600" />
              </div>
              <Terminal className="w-3.5 h-3.5 text-gray-500" />
              {icon}
              <span
                className={`text-[10px] font-bold uppercase tracking-widest ${config.title} font-mono`}
              >
                {label}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-gray-500 transition-transform duration-200 shrink-0" />
          </AccordionTrigger>
          <AccordionContent className="bg-[#090c13]">
            <TerminalContent content={cleanContent} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
