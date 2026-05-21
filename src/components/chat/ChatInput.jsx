'use client';

import {
  Send,
  Loader2,
  Slash,
  Cpu,
  ChevronDown,
  Square,
  TerminalSquare,
  Search,
  FileText,
  ListChecks,
  PenTool,
  CheckSquare,
  Code,
  ShieldCheck,
  Archive,
  Brain,
  GitPullRequest,
  Bug,
  Scale,
  TestTube,
  Wrench,
  Palette,
  Zap,
  Monitor,
  Command,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { filterSlashCommands, groupByCategory } from '@/lib/slashSkills';

// Map icon names to lucide-react components
const iconMap = {
  Search,
  FileText,
  ListChecks,
  PenTool,
  CheckSquare,
  Code,
  ShieldCheck,
  Archive,
  Brain,
  GitPullRequest,
  Bug,
  Scale,
  TestTube,
  Wrench,
  Palette,
  Zap,
  Monitor,
  TerminalSquare,
};

export default function ChatInput({
  isWaitingForSubagent,
  isTyping,
  isStreaming,
  prompt,
  textareaRef,
  showSlashMenu,
  slashFilter,
  slashIndex,
  favoriteModels,
  activeModelOverride,
  activeProviderName,
  abortControllerRef,
  onPromptChange,
  onKeyDown,
  onSlashSelect,
  onOpenCommandPalette,
  onModelOverrideChange,
  onStopGenerating,
  onSend,
}) {
  // ── Auto-resize textarea ──────────────────────────────────────────────────
  const internalRef = useRef(null);
  const ref = textareaRef || internalRef;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 300) + 'px';
  }, [prompt, ref]);

  // Label corto del modelo activo (sin prefijo de proveedor ni fecha)
  const modelLabel = activeModelOverride
    ? activeModelOverride
        .split('/')
        .pop()
        .replace(/-\d{4}-\d{2}-\d{2}$/, '')
        .replace(/-latest$/, '')
        .replace(/-preview$/, '')
        .replace(/:free$/, '')
    : 'Auto';

  return (
    <div
      className="flex-shrink-0 px-4 pt-2 pb-3 border-t"
      style={{ background: 'var(--surface-app)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="max-w-[860px] mx-auto relative">
        <div
          className={`border transition-all rounded-xl shadow-lg flex flex-col ${
            isWaitingForSubagent ? 'opacity-80' : 'focus-within:ring-1'
          }`}
          style={{
            background: 'var(--surface-muted)',
            borderColor: isWaitingForSubagent ? 'rgba(245,158,11,0.5)' : 'var(--border-strong)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            '--tw-ring-color': 'var(--accent-primary)',
          }}
        >
          {/* ── Indicador de subagente ejecutando ── */}
          {isWaitingForSubagent && (
            <div
              className="flex items-center gap-2 px-3 py-1 border-b text-[10px] font-mono font-bold tracking-wider"
              style={{
                color: '#f59e0b',
                background: 'rgba(245,158,11,0.08)',
                borderColor: 'rgba(245,158,11,0.2)',
                borderRadius: '0.75rem 0.75rem 0 0',
              }}
            >
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Sub-agente ejecutando…
            </div>
          )}

          {/* ── Textarea auto-resize ── */}
          <textarea
            ref={ref}
            value={prompt}
            onChange={onPromptChange}
            onKeyDown={onKeyDown}
            placeholder="Mensaje al orquestador… (/ para comandos, ↵ envía)"
            disabled={isTyping || isWaitingForSubagent}
            rows={1}
            className="w-full bg-transparent text-[13px] px-3 pt-2.5 pb-1 outline-none resize-none font-sans placeholder:opacity-40 leading-relaxed"
            style={{
              color: 'var(--text-primary)',
              minHeight: '38px',
              maxHeight: '300px',
              overflow: 'hidden',
            }}
          />

          {/* ── Slash command menu ── */}
          {showSlashMenu &&
            (() => {
              const filtered = filterSlashCommands(slashFilter);
              const grouped = groupByCategory(filtered);
              const categoryOrder = ['SDD', 'MCP', 'Skills', 'UX/UI'];

              return (
                <div
                  className="absolute bottom-full left-0 right-0 mb-2 border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150"
                  style={{
                    background: 'var(--surface-card)',
                    borderColor: 'var(--border-strong)',
                  }}
                >
                  <div
                    className="px-4 py-2 border-b flex items-center justify-between"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border-strong)',
                    }}
                  >
                    <span
                      className="text-xs font-bold tracking-wider uppercase"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Comandos
                    </span>
                    {slashFilter && (
                      <span
                        className="text-xs font-mono"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="py-1 max-h-[280px] overflow-y-auto">
                    {filtered.length === 0 ? (
                      <div
                        className="px-4 py-6 text-center text-xs"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        No se encontraron comandos para &quot;{slashFilter}&quot;
                      </div>
                    ) : (
                      categoryOrder
                        .filter((cat) => grouped[cat])
                        .flatMap((cat) => [
                          <div
                            key={`cat-${cat}`}
                            className="px-3 py-1.5 text-[11px] font-bold tracking-widest uppercase border-y mt-1 first:mt-0"
                            style={{
                              color: 'var(--text-muted)',
                              borderColor: 'var(--border-subtle)',
                              background: 'var(--surface-elevated)',
                            }}
                          >
                            {cat === 'SDD'
                              ? 'Spec-Driven Development'
                              : cat === 'MCP'
                                ? 'MCP Tools'
                                : cat === 'Skills'
                                  ? 'Skills'
                                  : 'UX / UI'}
                          </div>,
                          ...grouped[cat].map((opt) => {
                            const flatIndex = filtered.findIndex((s) => s.cmd === opt.cmd);
                            const isSelected = flatIndex === slashIndex;
                            const IconComponent = iconMap[opt.icon] || TerminalSquare;
                            return (
                              <div
                                key={opt.cmd}
                                onClick={() => onSlashSelect(opt.cmd)}
                                className={`px-3 py-2 cursor-pointer transition-all border-l-2 ${
                                  isSelected
                                    ? 'border-l-2'
                                    : 'border-l-2 border-transparent hover:bg-[color:var(--surface-hover)]'
                                }`}
                                style={
                                  isSelected
                                    ? {
                                        background:
                                          'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                                        borderLeftColor: 'var(--accent-primary)',
                                      }
                                    : {}
                                }
                              >
                                <div className="flex items-center gap-2.5">
                                  <IconComponent
                                    className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? '' : opt.color}`}
                                    style={isSelected ? { color: 'var(--accent-primary)' } : {}}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`font-mono text-xs font-bold ${isSelected ? '' : opt.color}`}
                                        style={isSelected ? { color: 'var(--accent-primary)' } : {}}
                                      >
                                        {opt.cmd}
                                      </span>
                                      <span
                                        className="text-[10px] px-1 py-0.5 rounded font-mono"
                                        style={{
                                          background: 'var(--surface-hover)',
                                          color: 'var(--text-muted)',
                                        }}
                                      >
                                        {opt.category}
                                      </span>
                                    </div>
                                    <p
                                      className={`text-[11px] mt-0.5 leading-snug ${isSelected ? 'text-blue-200/70' : ''}`}
                                      style={!isSelected ? { color: 'var(--text-muted)' } : {}}
                                    >
                                      {opt.description}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          }),
                        ])
                    )}
                  </div>

                  <div
                    className="px-3 py-1.5 border-t flex items-center gap-3"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border-strong)',
                    }}
                  >
                    {[
                      ['↑↓', 'navegar'],
                      ['Enter', 'seleccionar'],
                      ['Esc', 'cerrar'],
                    ].map(([k, label]) => (
                      <span key={k} className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        <kbd
                          className="px-1 py-0.5 rounded font-mono mr-1"
                          style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}
                        >
                          {k}
                        </kbd>
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

          {/* ── Footer toolbar ── */}
          <div className="flex items-center justify-between px-2.5 pb-1.5 pt-0.5 gap-2">
            {/* Left: comando palette + model selector */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={onOpenCommandPalette}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                style={{ color: 'var(--text-muted)', background: 'var(--surface-hover)' }}
                title="Command Palette (Ctrl+K)"
              >
                <Command className="w-3 h-3" />
              </button>

              {/* Model selector — pill compacto inline dentro del box */}
              {activeProviderName ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors text-[11px] font-mono font-medium"
                      style={{
                        background: activeModelOverride
                          ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)'
                          : 'var(--surface-hover)',
                        borderColor: activeModelOverride
                          ? 'color-mix(in srgb, var(--accent-primary) 30%, transparent)'
                          : 'var(--border-strong)',
                        color: activeModelOverride ? 'var(--accent-primary)' : 'var(--text-muted)',
                      }}
                    >
                      <Cpu className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="max-w-[120px] truncate">{modelLabel}</span>
                      <ChevronDown className="w-2.5 h-2.5 opacity-50 flex-shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    side="top"
                    className="w-[220px]"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border-strong)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <DropdownMenuLabel
                      className="text-[10px] uppercase font-bold tracking-wider"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Modelo — {activeProviderName}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator style={{ background: 'var(--border-strong)' }} />
                    <DropdownMenuRadioGroup
                      value={activeModelOverride}
                      onValueChange={onModelOverrideChange}
                    >
                      <DropdownMenuRadioItem
                        value=""
                        className="text-[12px] cursor-pointer"
                        style={{ '--highlight-bg': 'var(--surface-hover)' }}
                      >
                        Auto (proveedor activo)
                      </DropdownMenuRadioItem>
                      {/* Ensure current override is in the list even if not in favorites */}
                      {activeModelOverride && !favoriteModels.includes(activeModelOverride) && (
                        <DropdownMenuRadioItem
                          value={activeModelOverride}
                          className="text-[12px] cursor-pointer font-mono"
                          style={{ '--highlight-bg': 'var(--surface-hover)' }}
                        >
                          {activeModelOverride
                            .split('/')
                            .pop()
                            .replace(/-\d{4}-\d{2}-\d{2}$/, '')
                            .replace(/-latest$/, '')
                            .replace(/-preview$/, '')}
                        </DropdownMenuRadioItem>
                      )}
                      {favoriteModels.map((mId) => (
                        <DropdownMenuRadioItem
                          key={mId}
                          value={mId}
                          className="text-[12px] cursor-pointer font-mono"
                          style={{ '--highlight-bg': 'var(--surface-hover)' }}
                        >
                          {mId
                            .split('/')
                            .pop()
                            .replace(/-\d{4}-\d{2}-\d{2}$/, '')
                            .replace(/-latest$/, '')
                            .replace(/-preview$/, '')}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span
                  className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}
                >
                  <Slash className="w-2.5 h-2.5" style={{ color: 'var(--accent-primary)' }} />
                  Agent Teams
                </span>
              )}
            </div>

            {/* Right: stop + send */}
            <div className="flex items-center gap-1.5">
              {(isStreaming || isTyping) && abortControllerRef.current && (
                <button
                  onClick={onStopGenerating}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all cursor-pointer border"
                  style={{
                    background: 'var(--danger, #ef4444)',
                    borderColor: 'color-mix(in srgb, var(--danger, #ef4444) 50%, transparent)',
                    color: 'white',
                  }}
                  title="Detener"
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              )}

              <button
                onClick={() => onSend()}
                disabled={(!prompt.trim() || isTyping || isWaitingForSubagent) && !isStreaming}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 cursor-pointer"
                style={{
                  background: isStreaming ? 'var(--surface-hover)' : 'var(--accent-primary)',
                  color: 'white',
                  boxShadow: isStreaming
                    ? 'none'
                    : '0 0 12px color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                }}
              >
                {isStreaming ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 ml-0.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
