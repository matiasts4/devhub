import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Send, FileText, ChevronDown, AlertCircle } from 'lucide-react';

// ─── Agent Profile Options ────────────────────────────────────────────────────

const AGENT_PROFILES = [
  {
    id: 'general',
    name: 'Agente General',
    description: 'Agente de propósito general para tareas variadas',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'frontend',
    name: 'Frontend Specialist',
    description: 'Especializado en React, Next.js, Tailwind CSS',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'backend',
    name: 'Backend Specialist',
    description: 'Especializado en Go, Node.js, APIs REST',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'qa',
    name: 'QA / Testing',
    description: 'Especializado en testing, revisión de código',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Diseño de arquitectura, patrones, decisiones técnicas',
    model: 'claude-opus-4-20250514',
  },
];

// ─── AgentLaunchModal ─────────────────────────────────────────────────────────

export default function AgentLaunchModal({ isOpen, onClose, onLaunch, projects = [] }) {
  const [selectedProfile, setSelectedProfile] = useState('general');
  const [instructions, setInstructions] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef(null);
  const textareaRef = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showProfileDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfileDropdown]);

  // Focus textarea on open
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Reset form on close
  useEffect(() => {
    if (!isOpen) {
      setInstructions('');
      setError('');
      setIsLaunching(false);
    }
  }, [isOpen]);

  const handleLaunch = useCallback(async () => {
    if (!instructions.trim()) {
      setError('Las instrucciones son requeridas');
      return;
    }
    if (!selectedProject && projects.length > 0) {
      setError('Selecciona un proyecto');
      return;
    }

    setIsLaunching(true);
    setError('');

    const profile = AGENT_PROFILES.find((p) => p.id === selectedProfile);

    try {
      await onLaunch?.({
        profile: selectedProfile,
        profileName: profile?.name || selectedProfile,
        model: profile?.model,
        instructions: instructions.trim(),
        projectId: selectedProject || projects[0]?.id,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Error al lanzar el agente');
    } finally {
      setIsLaunching(false);
    }
  }, [instructions, selectedProfile, selectedProject, projects, onLaunch, onClose]);

  if (!isOpen) return null;

  const currentProfile = AGENT_PROFILES.find((p) => p.id === selectedProfile);

  return (
    <div
      className="fixed inset-x-0 bottom-0 top-[46px] z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[85vh]"
        style={{
          background: 'var(--surface-muted)',
          border: '1px solid var(--border-strong)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-strong)' }}
        >
          <div className="flex items-center gap-3">
            <Send className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Lanzar Agente
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.background = 'var(--surface-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {/* Agent Profile Selector */}
          <div>
            <label
              className="text-[11px] uppercase tracking-wider font-semibold mb-1.5 block"
              style={{ color: 'var(--text-muted)' }}
            >
              Perfil del Agente
            </label>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowProfileDropdown((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer"
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-primary)',
                }}
              >
                <div>
                  <span className="text-xs font-medium">{currentProfile?.name}</span>
                  <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {currentProfile?.description}
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-muted)' }}
                />
              </button>

              {showProfileDropdown && (
                <div
                  className="absolute z-10 w-full mt-1 rounded-lg overflow-hidden shadow-lg"
                  style={{
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  {AGENT_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => {
                        setSelectedProfile(profile.id);
                        setShowProfileDropdown(false);
                      }}
                      className="w-full px-3 py-2.5 text-left transition-colors cursor-pointer"
                      style={{
                        background:
                          selectedProfile === profile.id ? 'var(--surface-hover)' : 'transparent',
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedProfile !== profile.id) {
                          e.currentTarget.style.background = 'var(--surface-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedProfile !== profile.id) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      <span
                        className="text-xs font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {profile.name}
                      </span>
                      <p className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {profile.description}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Project Selector */}
          {projects.length > 0 && (
            <div>
              <label
                className="text-[11px] uppercase tracking-wider font-semibold mb-1.5 block"
                style={{ color: 'var(--text-muted)' }}
              >
                Proyecto
              </label>
              <select
                value={selectedProject}
                onChange={(e) => {
                  setSelectedProject(e.target.value);
                  setError('');
                }}
                className="w-full px-3 py-2.5 rounded-lg text-xs font-mono transition-colors focus:outline-none cursor-pointer"
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border-strong)',
                  color: selectedProject ? 'var(--text-primary)' : 'var(--text-muted)',
                }}
              >
                <option value="">Seleccionar proyecto…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Instructions */}
          <div>
            <label
              className="text-[11px] uppercase tracking-wider font-semibold mb-1.5 block"
              style={{ color: 'var(--text-muted)' }}
            >
              Instrucciones
            </label>
            <textarea
              ref={textareaRef}
              value={instructions}
              onChange={(e) => {
                setInstructions(e.target.value);
                setError('');
              }}
              placeholder="Describe qué debe hacer el agente…"
              rows={5}
              className="w-full px-3 py-2.5 rounded-lg text-xs font-mono resize-none transition-colors focus:outline-none"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor =
                  'color-mix(in srgb, var(--accent-primary) 50%, transparent)')
              }
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{
                background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
              }}
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--danger)' }} />
              <span className="text-xs" style={{ color: 'var(--danger)' }}>
                {error}
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-3"
          style={{ borderTop: '1px solid var(--border-strong)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-secondary)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleLaunch}
            disabled={isLaunching}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'var(--accent-primary)',
              border: '1px solid var(--accent-primary)',
              color: 'var(--text-on-brand-base, #000)',
            }}
          >
            {isLaunching ? (
              <>
                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Lanzando…
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Lanzar Agente
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
