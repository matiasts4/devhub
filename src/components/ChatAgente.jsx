'use client';
import { Bot, Play, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ChatAgente({ projectId = null, projectName = 'el proyecto' }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  // Agent Status: null | 'running' | 'completed' | 'failed'
  const [agentStatus, setAgentStatus] = useState(null);
  const [currentAgentId, setCurrentAgentId] = useState(null);

  // Fetch available profiles and quotas on mount
  useEffect(() => {
    async function fetchProfilesAndQuotas() {
      try {
        const res = await fetch('/api/agents/quotas');
        const data = await res.json();
        if (data.success && data.quotas.length > 0) {
          setProfiles(data.quotas);
          setSelectedProfile(data.quotas[0].profile);
        }
      } catch (err) {
        console.error('Failed to fetch profiles/quotas:', err);
      }
    }
    fetchProfilesAndQuotas();
  }, []);

  // Supabase Realtime Subscription
  useEffect(() => {
    if (!currentAgentId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`agent_registry_changes_${currentAgentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_registry',
          filter: `id=eq.${currentAgentId}`,
        },
        (payload) => {
          console.log('Agent status update received:', payload);
          if (payload.new && payload.new.status) {
            setAgentStatus(payload.new.status);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentAgentId]);

  const handleLaunch = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || !selectedProfile) return;

    setIsLaunching(true);
    setAgentStatus(null);
    setCurrentAgentId(null);

    try {
      const res = await fetch('/api/agents/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          task: prompt,
          profileName: selectedProfile,
          projectId: projectId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error launching agent');
      }

      setCurrentAgentId(data.agentId);
      setAgentStatus('running');
      setPrompt(''); // clear input on success
    } catch (err) {
      console.error('Launch error:', err);
      setAgentStatus('failed');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div
      data-testid="chat-agente"
      className="flex flex-col bg-surface-card border border-borders-subtle rounded-xl overflow-hidden p-6"
      style={{ minHeight: '380px' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#388BFD]/10 border border-[#388BFD]/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-accent-primary" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-text-primary font-semibold text-sm">Lanzador de Agente</h3>
          <p className="text-xs text-text-muted">
            Contexto: <strong>{projectName}</strong>
          </p>
        </div>
      </div>

      <form onSubmit={handleLaunch} className="flex flex-col flex-1 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted font-medium ml-1">Perfil Gemini</label>
          <select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            disabled={isLaunching || agentStatus === 'running'}
            className="bg-surface-elevated border border-borders-subtle text-text-primary text-sm rounded-lg px-3 py-2 outline-none focus:border-accent-primary transition-colors"
          >
            {profiles.length === 0 && <option value="">Cargando perfiles...</option>}
            {profiles.map((p) => (
              <option key={p.profile} value={p.profile}>
                {p.profile} ({p.quota})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-xs text-text-muted font-medium ml-1">Instrucciones</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLaunching || agentStatus === 'running'}
            placeholder="Ej: Revisa los logs de errores recientes y propón una solución..."
            className="flex-1 min-h-[120px] bg-surface-elevated border border-borders-subtle text-text-primary text-sm rounded-lg p-3 outline-none focus:border-accent-primary transition-colors resize-none"
          />
        </div>

        <div className="mt-auto pt-2 border-t border-borders-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            {agentStatus === 'running' && (
              <>
                <Loader2 className="w-4 h-4 text-accent-primary animate-spin" />
                <span className="text-xs text-accent-primary font-medium">
                  Agente trabajando...
                </span>
              </>
            )}
            {agentStatus === 'completed' && (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-500 font-medium">Tarea completada</span>
              </>
            )}
            {agentStatus === 'failed' && (
              <>
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs text-red-500 font-medium">Error en la tarea</span>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={
              !prompt.trim() || !selectedProfile || isLaunching || agentStatus === 'running'
            }
            className="flex items-center gap-2 bg-accent-primary hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLaunching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Lanzar Agente
          </button>
        </div>
      </form>
    </div>
  );
}
