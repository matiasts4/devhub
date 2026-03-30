'use client';

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Network, Loader2, Search, AlertCircle, Lightbulb, Bug, Server } from 'lucide-react';

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
    <div className="min-h-screen bg-surface-app flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[#a855f7]/10 border border-[#a855f7]/20">
            <Network className="w-3.5 h-3.5 text-[#a855f7]" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-sm font-bold text-text-primary">Cerebro / Engram</h1>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Buscar memorias..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-surface-elevated border border-borders-subtle rounded-md pl-9 pr-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-[#a855f7]/50 w-64"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-surface-elevated border border-borders-subtle rounded-md px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-[#a855f7]/50"
          >
            <option value="all">Todas las categorías</option>
            <option value="decision">Decisions</option>
            <option value="bugfix">Bugfixes</option>
            <option value="architecture">Architecture</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {!project?.id ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 mt-20">
            <AlertCircle className="w-8 h-8 text-borders-strong" />
            <p className="text-sm">Selecciona un proyecto para ver sus memorias.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full mt-20">
            <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex gap-3 text-red-400 max-w-2xl mx-auto mt-10">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <h3 className="text-sm font-medium">Error cargando memorias</h3>
              <p className="text-xs mt-1 opacity-80">{error}</p>
            </div>
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 mt-20">
            <Network className="w-12 h-12 text-borders-strong" strokeWidth={1} />
            <p className="text-sm">No se encontraron memorias.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {memories.map((memory) => {
              const mapped = mapMemoryType(memory.tipo);
              const Icon = mapped.icon;
              return (
                <div
                  key={memory.id}
                  className="bg-surface-card border border-borders-subtle rounded-xl p-4 flex flex-col gap-3 hover:border-borders-strong transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3
                      className="text-sm font-semibold text-text-primary line-clamp-2"
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
                    className="text-xs text-text-muted line-clamp-4 flex-1 whitespace-pre-wrap"
                    title={memory.value}
                  >
                    {memory.value}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-text-muted mt-2 pt-2 border-t border-borders-subtle">
                    <span className="truncate max-w-[120px]" title={memory.agent_id}>
                      {memory.agent_id ? `Agente: ${memory.agent_id.split('-')[0]}` : 'Sistema'}
                    </span>
                    <span>{new Date(memory.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
