import React from 'react';
import { ChevronRight, Brain, TerminalSquare } from 'lucide-react';
/**
 * SubagentBreadcrumbs — Breadcrumbs de navegación jerárquica que muestra
 * la cadena de sesiones padre → hijo. Estilo: "Orquestador → SDD-Explore → Módulo 3"
 *
 * Props:
 *   - chain: array de { id, title, isRoot } — cadena de sesiones desde root hasta actual
 *   - onNavigate: (sessionId) => void — callback para navegar a una sesión
 *   - currentSessionId: string — ID de la sesión actual (se resalta)
 */
export default function SubagentBreadcrumbs({ chain = [], onNavigate, currentSessionId }) {
  if (chain.length <= 1) return null;

  return (
    <div
      className="flex items-center gap-1 px-4 py-1.5 border-b flex-shrink-0 overflow-x-auto"
      style={{
        background: 'var(--surface-card)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {chain.map((item, index) => {
        const isCurrent = item.id === currentSessionId;
        const isRoot = item.isRoot || index === 0;
        const isLast = index === chain.length - 1;

        return (
          <React.Fragment key={item.id}>
            {/* Separador */}
            {index > 0 && (
              <ChevronRight
                className="w-3 h-3 flex-shrink-0"
                style={{ color: 'var(--text-muted)', opacity: 0.3 }}
              />
            )}

            {/* Item del breadcrumb */}
            <button
              onClick={() => !isCurrent && onNavigate?.(item.id)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono transition-colors flex-shrink-0 ${
                isCurrent
                  ? 'cursor-default'
                  : 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)]'
              }`}
              style={{
                color: isCurrent ? 'var(--accent-primary)' : 'var(--text-muted)',
                fontWeight: isCurrent ? '600' : '400',
                background: isCurrent
                  ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)'
                  : 'transparent',
              }}
              title={isCurrent ? 'Sesión actual' : `Ir a: ${item.title}`}
            >
              {/* Icono según tipo */}
              {isRoot ? (
                <Brain className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
              ) : (
                <TerminalSquare className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
              )}

              {/* Título truncado */}
              <span className="truncate max-w-[160px]">{isRoot ? 'Orquestador' : item.title}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
