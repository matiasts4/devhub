'use client'

import { TerminalSquare, Globe, Users, FileText, CheckCircle2, XCircle } from 'lucide-react'

const TOOL_ICONS = {
  open_terminal: TerminalSquare,
  open_url: Globe,
  delegate_to_opencode: Users,
  browse_files: FileText,
  review_log_file: FileText,
  get_swarm_status: Users,
}

export default function ToolResult({ toolName, result, error }) {
  const Icon = TOOL_ICONS[toolName] || TerminalSquare
  const hasError = error || result?.error

  return (
    <div className={`rounded-lg border px-3 py-2 text-[12px] ${hasError ? 'border-[var(--danger,#ef4444)]/30 bg-[var(--danger,#ef4444)]/5' : 'border-[var(--border-subtle)] bg-[var(--surface-muted)]'}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${hasError ? 'text-[var(--danger,#ef4444)]' : 'text-[var(--accent-primary)]'}`} />
        <span className="font-mono font-medium" style={{ color: hasError ? 'var(--danger,#ef4444)]' : 'var(--text-primary)' }}>
          {toolName}
        </span>
        {hasError ? (
          <XCircle className="w-3 h-3 text-[var(--danger,#ef4444)]" />
        ) : (
          <CheckCircle2 className="w-3 h-3 text-green-500" />
        )}
      </div>
      <div className="pl-5 font-mono text-[11px]" style={{ color: hasError ? 'var(--danger,#ef4444)]' : 'var(--text-muted)' }}>
        {error || result?.message || JSON.stringify(result, null, 2).slice(0, 200)}
      </div>
    </div>
  )
}