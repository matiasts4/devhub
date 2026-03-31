'use client';
import { Bot, Play, Loader2, TerminalSquare } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { createClient } from '@/lib/db/localSupabase';
import {
  buildDocOpsOrchestratorLaunchPrompt,
  enforceDocOpsGateOnLaunchCommand,
  shellQuotePrompt,
} from '@/lib/docopsPrompts';
import { getDocOpsContextBudgetPolicy } from '@/lib/docopsPolicy';

export default function ChatAgente({ projectId = null, projectName = 'el proyecto' }) {
  const [prompt, setPrompt] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('sdd-orchestrator');
  const [isLaunching, setIsLaunching] = useState(false);
  const navigate = useNavigate();
  const supabase = createClient();
  const docopsBudget = getDocOpsContextBudgetPolicy();

  const handleLaunch = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsLaunching(true);

    try {
      // Registrar el agente en la UI para tener Telemetría
      const agentId = `manual-${selectedAgent}-${Date.now()}`;
      const promptHint = prompt.trim().slice(0, 120);

      try {
        const hints = JSON.parse(localStorage.getItem('devhub_agent_task_hints') || '{}');
        hints[agentId] = promptHint;
        localStorage.setItem('devhub_agent_task_hints', JSON.stringify(hints));
      } catch {
        // Ignore localStorage failures (private mode / storage disabled)
      }

      if (projectId) {
        await supabase.from('agent_registry').insert({
          agent_id: agentId,
          project_id: projectId,
          nombre: selectedAgent.toUpperCase(),
          modelo_llm: 'OpenCode Local',
          status: 'working',
          last_heartbeat: new Date().toISOString(),
        });
      }

      // Agregamos instrucciones de telemetría para que el agente cierre el ciclo en la UI
      const telemetryPrompt =
        projectId && selectedAgent === 'sdd-orchestrator'
          ? buildDocOpsOrchestratorLaunchPrompt({
              agentId: selectedAgent,
              prompt,
              projectId,
              telemetryId: agentId,
            })
          : projectId
            ? `[Tú eres el agente ${selectedAgent}. Tu ID de telemetría en DevHub es '${agentId}'. Cuando termines esta instrucción, DEBES usar la herramienta update_agent_status con status='completed' y agent_id='${agentId}']\n\n${prompt}`
            : prompt;

      const command = enforceDocOpsGateOnLaunchCommand(
        `opencode --agent ${selectedAgent} --prompt ${shellQuotePrompt(telemetryPrompt)}`
      );

      // Navegar a la terminal y lanzar el evento
      navigate(`/project/${projectId}/terminales`);

      // Pequeño delay para asegurar que el componente de la terminal está montado
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('devhub:run-agent', {
            detail: {
              taskId: agentId,
              command: command,
              selectedAgent,
              launchOrigin: projectId ? 'project-launch' : 'ad-hoc-launch',
              promptSummary: promptHint,
            },
          })
        );
        toast.success(`Agente ${selectedAgent} lanzado en la terminal`);
        setPrompt('');
      }, 500);
    } catch (err) {
      console.error('Launch error:', err);
      toast.error('Error al lanzar el agente');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div
      data-testid="chat-agente"
      className="flex flex-col bg-surface-card border border-borders-subtle rounded-xl overflow-hidden p-6"
      style={{ minHeight: '340px' }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#388BFD]/10 border border-[#388BFD]/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-accent-primary" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-text-primary font-semibold text-sm">
            Lanzador de Agentes (OpenCode)
          </h3>
          <p className="text-xs text-text-muted">
            Contexto: <strong>{projectName}</strong>
          </p>
        </div>
      </div>

      <form onSubmit={handleLaunch} className="flex flex-col flex-1 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-muted font-medium ml-1">Perfil de OpenCode</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            disabled={isLaunching}
            className="bg-surface-elevated border border-borders-subtle text-text-primary text-sm rounded-lg px-3 py-2 outline-none focus:border-accent-primary transition-colors"
          >
            <option value="gentleman">Gentleman (Worker Default)</option>
            <option value="sdd-orchestrator">SDD Orchestrator</option>
            <option value="build">Build</option>
            <option value="plan">Plan</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-xs text-text-muted font-medium ml-1">Instrucciones</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLaunching}
            placeholder="Ej: Revisa los logs de errores recientes y propón una solución..."
            className="flex-1 min-h-[100px] bg-surface-elevated border border-borders-subtle text-text-primary text-sm rounded-lg p-3 outline-none focus:border-accent-primary transition-colors resize-none"
          />
        </div>

        <div className="mt-auto pt-3 border-t border-borders-subtle flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <TerminalSquare className="w-4 h-4" />
            <span>Se abrirá una terminal interactiva</span>
          </div>
          <span className="text-[10px] text-text-muted">
            Budget: {docopsBudget.max_tokens_context}/{docopsBudget.max_expansions}/
            {docopsBudget.expansion_step_tokens}
          </span>

          <button
            type="submit"
            disabled={!prompt.trim() || isLaunching}
            className="flex items-center gap-2 bg-accent-primary hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLaunching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Ejecutar
          </button>
        </div>
      </form>
    </div>
  );
}
