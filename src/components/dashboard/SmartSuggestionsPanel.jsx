'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMotionMode } from '@/components/ui/motion/MotionModeContext';
import { getTransition } from '@/components/ui/system/motion-tokens';
import {
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Lightbulb,
  Loader2,
  Send,
  Settings,
} from 'lucide-react';
import { buildLocalSuggestions } from '@/lib/suggestions/rules';
import suggestionsCache from '@/lib/suggestions/cache';

// ── Pure helper functions (exported for testing) ─────────────────────────────

const VALID_TYPES = new Set(['risk', 'alert', 'opportunity', 'tip']);

/**
 * Returns visual config for a suggestion type.
 * @param {'risk'|'alert'|'opportunity'|'tip'|string} type
 * @returns {{ color: string, chipLabel: string, iconName: string, bgColor: string }}
 */
export function getTypeConfig(type) {
  const configs = {
    risk: {
      color: 'var(--danger)',
      bgColor: 'color-mix(in srgb, var(--danger) 10%, transparent)',
      chipLabel: 'RIESGO',
      iconName: 'AlertTriangle',
    },
    alert: {
      color: '#E3B341',
      bgColor: 'color-mix(in srgb, #E3B341 10%, transparent)',
      chipLabel: 'ALERTA',
      iconName: 'AlertCircle',
    },
    opportunity: {
      color: 'var(--success)',
      bgColor: 'color-mix(in srgb, var(--success) 10%, transparent)',
      chipLabel: 'OPORTUNIDAD',
      iconName: 'Sparkles',
    },
    tip: {
      color: 'var(--accent-primary)',
      bgColor: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
      chipLabel: 'CONSEJO',
      iconName: 'Lightbulb',
    },
  };
  return (
    configs[type] || {
      color: 'var(--text-muted)',
      bgColor: 'color-mix(in srgb, var(--text-muted) 10%, transparent)',
      chipLabel: type?.toUpperCase() || 'INFO',
      iconName: 'AlertCircle',
    }
  );
}

/**
 * Returns a human-readable label for suggestion source.
 * @param {'rules'|'llm'|'hybrid'|string} source
 * @returns {string}
 */
export function getSourceLabel(source) {
  const labels = {
    rules: 'Reglas locales',
    llm: 'IA',
    hybrid: 'Combinado',
  };
  return labels[source] || 'Análisis';
}

/**
 * Validates that a suggestion matches the required schema.
 * @param {*} suggestion
 * @returns {boolean}
 */
export function isValidSuggestion(suggestion) {
  if (!suggestion || typeof suggestion !== 'object') return false;
  if (!suggestion.id || typeof suggestion.id !== 'string') return false;
  if (!suggestion.title || typeof suggestion.title !== 'string') return false;
  if (!VALID_TYPES.has(suggestion.type)) return false;
  return true;
}

// ── Icon component map ────────────────────────────────────────────────────────

function TypeIcon({ iconName, color, size = 16 }) {
  const props = { size, style: { color }, strokeWidth: 2 };
  switch (iconName) {
    case 'AlertTriangle':
      return <AlertTriangle {...props} />;
    case 'AlertCircle':
      return <AlertCircle {...props} />;
    case 'Sparkles':
      return <Sparkles {...props} />;
    case 'Lightbulb':
      return <Lightbulb {...props} />;
    default:
      return <AlertCircle {...props} />;
  }
}

// ── SuggestionCard ────────────────────────────────────────────────────────────

function SuggestionCard({ suggestion, motionMode }) {
  const cfg = getTypeConfig(suggestion.type);
  const isReduced = motionMode === 'reduced';
  const isAmplified = motionMode === 'amplified';
  return (
    <motion.div
      initial={isReduced ? { opacity: 0 } : { opacity: 0, y: isAmplified ? 12 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={isReduced ? { opacity: 0 } : { opacity: 0, y: isAmplified ? -8 : -4 }}
      transition={getTransition('open', motionMode)}
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{
        background: cfg.bgColor,
        border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
      }}
    >
      {/* Header row: icon + chip */}
      <div className="flex items-center gap-2">
        <TypeIcon iconName={cfg.iconName} color={cfg.color} size={14} />
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{
            color: cfg.color,
            background: `color-mix(in srgb, ${cfg.color} 15%, transparent)`,
          }}
        >
          {cfg.chipLabel}
        </span>
      </div>

      {/* Title */}
      <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
        {suggestion.title}
      </p>

      {/* Description */}
      {suggestion.description && (
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-muted)' }}>
          {suggestion.description}
        </p>
      )}

      {/* Action hint */}
      {suggestion.action_hint && (
        <p
          className="text-xs italic"
          style={{ color: `color-mix(in srgb, ${cfg.color} 80%, var(--text-muted))` }}
        >
          → {suggestion.action_hint}
        </p>
      )}
    </motion.div>
  );
}

// ── SuggestionSkeleton ────────────────────────────────────────────────────────

function SuggestionSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-16 rounded-xl animate-pulse"
          style={{ background: 'var(--surface-elevated)' }}
        />
      ))}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-8 gap-3 text-center rounded-xl"
      style={{
        background: 'var(--surface-elevated)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <Sparkles className="w-8 h-8 opacity-20" style={{ color: 'var(--accent-primary)' }} />
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Agregá al menos 2 tareas para recibir sugerencias
      </p>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

/**
 * @param {{ project: object, tasks: Array, milestones: Array }} props
 */
export default function SmartSuggestionsPanel({ project, tasks, milestones }) {
  const motionMode = useMotionMode();
  const [suggestions, setSuggestions] = useState([]);
  const [isLLMLoading, setIsLLMLoading] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [promptValue, setPromptValue] = useState('');
  const [isPromptLoading, setIsPromptLoading] = useState(false);
  const [source, setSource] = useState('rules');

  // ── Step 1: Run local rules synchronously on mount ─────────────────────
  useEffect(() => {
    if (!project?.id || !tasks) return;
    const localSuggestions = buildLocalSuggestions(project, tasks || [], milestones || []);
    setSuggestions(localSuggestions);
  }, [project?.id, tasks, milestones]);

  // ── Step 2: Try cache then LLM async ──────────────────────────────────
  const fetchLLMSuggestions = useCallback(
    async (invalidateFirst = false) => {
      if (!project?.id) return;

      if (invalidateFirst) {
        suggestionsCache.invalidate(project.id);
      }

      // Check cache
      const cached = suggestionsCache.get(project.id);
      if (cached) {
        setSuggestions(cached);
        setSource('llm');
        return;
      }

      setIsLLMLoading(true);
      setLlmError(null);

      try {
        const resp = await fetch('/api/ai/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: project.id, mode: 'auto' }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: 'Error desconocido' }));
          // If it's a "no LLM configured" error, show it subtly
          if (resp.status === 400 && err.error?.includes('proveedor LLM')) {
            setLlmError('no-llm');
          } else {
            setLlmError(err.error || 'Error al obtener sugerencias');
          }
          return;
        }

        const data = await resp.json();
        // If route signals no LLM is configured, show Settings CTA
        if (data.no_llm) {
          setLlmError('no-llm');
        }
        if (data.suggestions?.length > 0) {
          setSuggestions(data.suggestions);
          setSource(data.source || 'llm');
          if (!data.no_llm) {
            suggestionsCache.set(project.id, data.suggestions);
          }
        }
      } catch (err) {
        setLlmError(err.message || 'Error de conexión');
      } finally {
        setIsLLMLoading(false);
      }
    },
    [project?.id]
  );

  useEffect(() => {
    fetchLLMSuggestions(false);
  }, [fetchLLMSuggestions]);

  // ── Prompt mode ────────────────────────────────────────────────────────
  const handlePromptSubmit = useCallback(async () => {
    if (!promptValue.trim() || isPromptLoading || !project?.id) return;

    setIsPromptLoading(true);
    setLlmError(null);

    try {
      const resp = await fetch('/api/ai/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          mode: 'prompt',
          prompt: promptValue.trim(),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Error desconocido' }));
        if (resp.status === 400 && err.error?.includes('proveedor LLM')) {
          setLlmError('no-llm');
        } else {
          setLlmError(err.error || 'Error al generar sugerencias');
        }
        return;
      }

      const data = await resp.json();
      if (data.no_llm) {
        setLlmError('no-llm');
        return;
      }
      if (data.suggestions?.length > 0) {
        setSuggestions(data.suggestions);
        setSource(data.source || 'llm');
        setPromptValue('');
      }
    } catch (err) {
      setLlmError(err.message || 'Error de conexión');
    } finally {
      setIsPromptLoading(false);
    }
  }, [promptValue, isPromptLoading, project?.id]);

  // ── Render ─────────────────────────────────────────────────────────────
  const validSuggestions = suggestions.filter(isValidSuggestion);
  const showSkeleton = isLLMLoading && validSuggestions.length === 0;

  return (
    <div
      className="rounded-2xl overflow-hidden fade-in-up"
      style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)',
            }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <div>
            <h3
              className="font-mono text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Sugerencias Inteligentes
            </h3>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              Análisis automático del proyecto
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Source badge */}
          <span
            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-medium"
            style={{
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-muted)',
              background: 'var(--surface-elevated)',
            }}
          >
            {getSourceLabel(source)}
          </span>

          {/* Loading indicator / Refresh button */}
          {isLLMLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }} />
          ) : (
            <button
              onClick={() => fetchLLMSuggestions(true)}
              className="p-1.5 rounded-lg transition-colors hover:bg-surface-elevated cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              title="Actualizar sugerencias"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="p-5 space-y-4">
        {/* LLM Error state */}
        {llmError && llmError !== 'no-llm' && (
          <div
            className="rounded-xl px-4 py-3 text-xs"
            style={{
              background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
              color: 'var(--danger)',
            }}
          >
            {llmError}
          </div>
        )}

        {/* No LLM configured */}
        {llmError === 'no-llm' && (
          <div
            className="rounded-xl px-4 py-3 text-xs flex items-center justify-between"
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
            }}
          >
            <span>No hay proveedor LLM configurado.</span>
            <a
              href="/settings"
              className="text-xs font-medium hover:underline"
              style={{ color: 'var(--accent-primary)' }}
            >
              Configurar →
            </a>
          </div>
        )}

        {/* Suggestion list */}
        {showSkeleton ? (
          <SuggestionSkeleton />
        ) : validSuggestions.length > 0 ? (
          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {validSuggestions.map((s) => (
                <SuggestionCard key={s.id} suggestion={s} motionMode={motionMode} />
              ))}
            </div>
          </AnimatePresence>
        ) : (
          <EmptyState />
        )}

        {/* ── Prompt mode ─────────────────────────────────────────────── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="p-3 space-y-2">
            <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              Consultá al agente
            </p>
            <textarea
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePromptSubmit();
              }}
              rows={2}
              placeholder="Ej: Dame 5 sugerencias para mejorar la arquitectura del proyecto…"
              className="w-full resize-none text-xs rounded-lg px-3 py-2 outline-none"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={handlePromptSubmit}
              disabled={!promptValue.trim() || isPromptLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'var(--accent-primary)',
                color: 'white',
              }}
            >
              {isPromptLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              Generar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
