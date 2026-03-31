'use client';

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Network,
  Loader2,
  Search,
  AlertCircle,
  Lightbulb,
  Bug,
  Server,
  Hash,
  Brain,
} from 'lucide-react';

const mapMemoryType = (mcpType) => {
  switch (mcpType) {
    case 'decision':
      return {
        label: 'Decision',
        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        icon: Lightbulb,
        id: 'decision',
      };
    case 'error':
      return {
        label: 'Bugfix',
        color: 'text-red-400 bg-red-500/10 border-red-500/20',
        icon: Bug,
        id: 'bugfix',
      };
    case 'fact':
    case 'context':
    default:
      return {
        label: 'Architecture',
        color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
        icon: Server,
        id: 'architecture',
      };
  }
};

export default function Cerebro() {
  const { project } = useOutletContext() || {};
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const decisionCount = memories.filter((m) => mapMemoryType(m.tipo).id === 'decision').length;
  const bugfixCount = memories.filter((m) => mapMemoryType(m.tipo).id === 'bugfix').length;
  const architectureCount = memories.filter(
    (m) => mapMemoryType(m.tipo).id === 'architecture'
  ).length;

  useEffect(() => {
    if (!project?.id) {
      setLoading(false);
      return;
    }

    const fetchMemories = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL('/api/engram/memories', window.location.origin);
        url.searchParams.append('projectId', project.id);
        if (searchTerm) url.searchParams.append('query', searchTerm);

        // We always fetch 'all' types from the backend and map them to our UI categories
        // since our UI categories combine 'fact' and 'context' into 'architecture'.
        url.searchParams.append('tipo', 'all');

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch memories');
        }

        let fetchedMemories = data || [];

        if (filterType !== 'all') {
          fetchedMemories = fetchedMemories.filter((m) => {
            const mapped = mapMemoryType(m.tipo);
            return mapped.id === filterType;
          });
        }

        // Sort by created_at descending if not already sorted
        fetchedMemories.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        setMemories(fetchedMemories);
      } catch (err) {
        console.error('Error fetching memories:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      fetchMemories();
    }, 300);

    return () => clearTimeout(timer);
  }, [project?.id, searchTerm, filterType]);

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--surface-app)', color: 'var(--text-primary)' }}
    >
      {/* Sticky Header */}
      <div
        className="sticky top-0 z-10 backdrop-blur-sm border-b px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{
          background: 'color-mix(in srgb, var(--surface-app) 90%, transparent)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: '#a855f718', border: '1px solid #a855f730' }}
          >
            <Network className="w-3.5 h-3.5 text-[#a855f7]" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Cerebro
          </h1>
          {project?.name && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted">
              {project.name}
            </span>
          )}
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Buscar memorias..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none transition-colors w-56"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg px-3 py-2 text-xs focus:outline-none appearance-none transition-colors"
            style={{
              background: 'var(--surface-muted)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="all">Todas las categorías</option>
            <option value="decision">Decisiones</option>
            <option value="bugfix">Bugfixes</option>
            <option value="architecture">Arquitectura</option>
          </select>
        </div>
      </div>

      <div className="px-6 py-6 w-full max-w-[1200px] mx-auto">
        {/* Breadcrumb */}
        <div
          className="rounded-xl border px-4 py-2.5 flex items-center gap-2 mb-6"
          style={{ background: 'var(--surface-card)', borderColor: 'var(--border-subtle)' }}
        >
          <Hash className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            DevHub
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ›
          </span>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Cerebro
          </span>
        </div>

        {/* Content */}
        {!project?.id ? (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="flex items-center gap-3 px-6 py-4"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: '#a855f718', border: '1px solid #a855f730' }}
              >
                <Brain className="w-4 h-4 text-[#a855f7]" />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Memorias del Proyecto
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Bitácora técnica verificable
                </p>
              </div>
            </div>
            <div className="p-6">
              <div className="flex flex-col items-center justify-center text-text-muted gap-2 py-10">
                <AlertCircle className="w-8 h-8" style={{ color: 'var(--border-strong)' }} />
                <p className="text-sm">Selecciona un proyecto para ver sus memorias.</p>
              </div>
            </div>
          </div>
        ) : loading ? (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="p-6">
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            </div>
          </div>
        ) : error ? (
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'var(--surface-card)',
              border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)',
            }}
          >
            <div
              className="flex items-center gap-3 px-6 py-4"
              style={{
                borderBottom: '1px solid color-mix(in srgb, var(--danger) 15%, transparent)',
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
                }}
              >
                <AlertCircle className="w-4 h-4" style={{ color: 'var(--danger)' }} />
              </div>
              <div>
                <h3 className="font-mono text-sm font-semibold" style={{ color: 'var(--danger)' }}>
                  Error cargando memorias
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {error}
                </p>
              </div>
            </div>
          </div>
        ) : memories.length === 0 ? (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}
          >
            <div
              className="flex items-center gap-3 px-6 py-4"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: '#a855f718', border: '1px solid #a855f730' }}
              >
                <Brain className="w-4 h-4 text-[#a855f7]" />
              </div>
              <div>
                <h3
                  className="font-mono text-sm font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Memorias del Proyecto
                </h3>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Bitácora técnica verificable
                </p>
              </div>
            </div>
            <div className="p-6">
              <div className="flex flex-col items-center justify-center text-text-muted gap-2 py-10">
                <Network
                  className="w-12 h-12"
                  strokeWidth={1}
                  style={{ color: 'var(--border-strong)' }}
                />
                <p className="text-sm">No se encontraron memorias.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="fade-in-up space-y-6">
            {/* Stats Card */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <div
                className="flex items-center gap-3 px-6 py-4"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: '#a855f718', border: '1px solid #a855f730' }}
                >
                  <Brain className="w-4 h-4 text-[#a855f7]" />
                </div>
                <div>
                  <h3
                    className="font-mono text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Memorias del Proyecto
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Bitácora técnica verificable — consultá decisiones y errores antes de lanzar
                    nuevos agentes
                  </p>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    className="rounded-xl border px-4 py-3"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="w-3.5 h-3.5 text-blue-400" />
                      <p
                        className="text-[10px] uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Decisiones
                      </p>
                    </div>
                    <p className="text-xl font-mono" style={{ color: 'var(--text-primary)' }}>
                      {decisionCount}
                    </p>
                  </div>
                  <div
                    className="rounded-xl border px-4 py-3"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Bug className="w-3.5 h-3.5 text-red-400" />
                      <p
                        className="text-[10px] uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Bugfixes
                      </p>
                    </div>
                    <p className="text-xl font-mono" style={{ color: 'var(--text-primary)' }}>
                      {bugfixCount}
                    </p>
                  </div>
                  <div
                    className="rounded-xl border px-4 py-3"
                    style={{
                      background: 'var(--surface-muted)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Server className="w-3.5 h-3.5 text-purple-400" />
                      <p
                        className="text-[10px] uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Arquitectura
                      </p>
                    </div>
                    <p className="text-xl font-mono" style={{ color: 'var(--text-primary)' }}>
                      {architectureCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Memories Grid Card */}
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--surface-card)',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-soft)',
              }}
            >
              <div
                className="flex items-center gap-3 px-6 py-4"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: '#a855f718', border: '1px solid #a855f730' }}
                >
                  <Network className="w-4 h-4 text-[#a855f7]" strokeWidth={1.5} />
                </div>
                <div>
                  <h3
                    className="font-mono text-sm font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Registros
                  </h3>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {memories.length} memoria{memories.length !== 1 ? 's' : ''} encontrada
                    {memories.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {memories.map((memory) => {
                    const mapped = mapMemoryType(memory.tipo);
                    const Icon = mapped.icon;
                    return (
                      <div
                        key={memory.id}
                        className="rounded-xl border p-4 flex flex-col gap-3 transition-colors hover:border-borders-strong"
                        style={{
                          background: 'var(--surface-muted)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3
                            className="text-sm font-semibold line-clamp-2"
                            style={{ color: 'var(--text-primary)' }}
                            title={memory.key}
                          >
                            {memory.key || 'Sin título'}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 shrink-0 ${mapped.color}`}
                          >
                            <Icon className="w-3 h-3" />
                            {mapped.label}
                          </span>
                        </div>
                        <p
                          className="text-xs line-clamp-4 flex-1 whitespace-pre-wrap"
                          style={{ color: 'var(--text-muted)' }}
                          title={memory.value}
                        >
                          {memory.value}
                        </p>
                        <div
                          className="flex items-center justify-between text-[10px] mt-2 pt-2"
                          style={{
                            color: 'var(--text-muted)',
                            borderColor: 'var(--border-subtle)',
                          }}
                        >
                          <span className="truncate max-w-[120px]" title={memory.agent_id}>
                            {memory.agent_id
                              ? `Agente: ${memory.agent_id.split('-')[0]}`
                              : 'Sistema'}
                          </span>
                          <span>{new Date(memory.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
