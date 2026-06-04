'use client';

import {
  TerminalSquare,
  Globe,
  Users,
  FileText,
  CheckCircle2,
  XCircle,
  List,
  Play,
  FolderOpen,
} from 'lucide-react';

const TOOL_META = {
  open_terminal: { icon: TerminalSquare, label: 'Terminal' },
  list_terminals: { icon: List, label: 'Terminales' },
  review_terminal_output: { icon: TerminalSquare, label: 'Salida terminal' },
  execute_in_terminal: { icon: Play, label: 'Comando enviado' },
  close_terminal: { icon: TerminalSquare, label: 'Cerrar terminal' },
  open_url: { icon: Globe, label: 'Navegador' },
  browse_files: { icon: FolderOpen, label: 'Archivos' },
  review_log_file: { icon: FileText, label: 'Log' },
  get_swarm_status: { icon: Users, label: 'Swarm' },
};

function summarizeToolResult(toolName, result) {
  if (!result || typeof result !== 'object') return null;
  if (result.error) return String(result.error);

  switch (toolName) {
    case 'open_terminal':
      if (result.command_sent || result.command) {
        return `Sesión ${result.session_id || '—'} · comando: ${result.command_sent || result.command}`;
      }
      return result.session_id
        ? `Terminal abierta (${result.session_id})`
        : result.message || null;
    case 'open_url':
      return result.in_app && result.url
        ? `Navegador integrado → ${result.url}`
        : result.url
          ? `Navegando a ${result.url}`
          : result.message || null;
    case 'execute_in_terminal':
      return result.sent ? 'Entrada enviada a la terminal activa' : null;
    case 'browse_files':
      if (result.items?.length) {
        return `${result.items.length} elemento(s) en ${result.path || '.'}`;
      }
      if (result.truncated) {
        return `Leído ${result.path} (${result.line_count} líneas, truncado)`;
      }
      return result.path ? `Leído ${result.path}` : null;
    case 'get_swarm_status':
      return result.message || (result.mission?.title ? `Misión: ${result.mission.title}` : null);
    default:
      return result.message || null;
  }
}

export default function ToolResult({ toolName, result, error }) {
  const meta = TOOL_META[toolName] || { icon: TerminalSquare, label: toolName };
  const Icon = meta.icon;
  const hasError = error || result?.error;
  const summary = error || summarizeToolResult(toolName, result);
  const detail =
    !hasError && summary
      ? null
      : error || result?.message || (result ? JSON.stringify(result, null, 2) : '');

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 text-[12px] backdrop-blur-sm ${
        hasError
          ? 'border-[color-mix(in_srgb,var(--danger,#ef4444)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger,#ef4444)_8%,var(--surface-muted))]'
          : 'border-[color-mix(in_srgb,var(--accent-primary)_22%,var(--border-subtle))] bg-[color-mix(in_srgb,var(--accent-primary)_6%,var(--surface-muted))]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md ${
            hasError ? 'bg-[var(--danger,#ef4444)]/15' : 'bg-[var(--accent-primary)]/15'
          }`}
        >
          <Icon
            className={`h-3.5 w-3.5 ${hasError ? 'text-[var(--danger,#ef4444)]' : 'text-[var(--accent-primary)]'}`}
          />
        </span>
        <span
          className="font-medium tracking-tight"
          style={{ color: hasError ? 'var(--danger,#ef4444)' : 'var(--text-primary)' }}
        >
          {meta.label}
        </span>
        <span className="font-mono text-[10px] text-[var(--text-muted)] opacity-80">{toolName}</span>
        {hasError ? (
          <XCircle className="ml-auto h-3.5 w-3.5 text-[var(--danger,#ef4444)]" />
        ) : (
          <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500/90" />
        )}
      </div>
      {(summary || detail) && (
        <p
          className="mt-2 pl-8 text-[11px] leading-relaxed"
          style={{ color: hasError ? 'var(--danger,#ef4444)' : 'var(--text-muted)' }}
        >
          {summary || (typeof detail === 'string' ? detail.slice(0, 280) : '')}
        </p>
      )}
    </div>
  );
}