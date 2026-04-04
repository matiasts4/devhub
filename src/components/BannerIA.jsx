'use client';
import { useState } from 'react';
import { Bot, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createClient } from '@/lib/db/localClient';
import {
  buildDocOpsOrchestratorLaunchPrompt,
  enforceDocOpsGateOnLaunchCommand,
  shellQuotePrompt,
} from '@/lib/docopsPrompts';
import { getDocOpsContextBudgetPolicy } from '@/lib/docopsPolicy';

export default function BannerIA({ project }) {
  const [prompt, setPrompt] = useState('');
  const navigate = useNavigate();
  const db = createClient();
  const docopsBudget = getDocOpsContextBudgetPolicy();

  const handleLaunch = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || !project) return;

    const agentId = `orchestrator-${Date.now()}`;
    const promptHint = prompt.trim().slice(0, 120);

    try {
      const hints = JSON.parse(localStorage.getItem('devhub_agent_task_hints') || '{}');
      hints[agentId] = promptHint;
      localStorage.setItem('devhub_agent_task_hints', JSON.stringify(hints));
    } catch {
      // Ignore localStorage failures (private mode / storage disabled)
    }

    // Registrar el agente en UI antes de lanzarlo para visualización en tiempo real
    await db.from('agent_registry').insert({
      agent_id: agentId,
      project_id: project.id,
      nombre: 'SDD ORCHESTRATOR',
      modelo_llm: 'OpenCode Local',
      status: 'working',
      last_heartbeat: new Date().toISOString(),
    });

    // Saltamos a la vista de terminales
    navigate(`/project/${project.id}/terminales`);

    // Comando interactivo usando el agente correcto con instrucciones de telemetría
    const telemetryPrompt = buildDocOpsOrchestratorLaunchPrompt({
      agentId: 'sdd-orchestrator',
      prompt,
      projectId: project.id,
      telemetryId: agentId,
    });
    const command = enforceDocOpsGateOnLaunchCommand(
      `opencode --agent sdd-orchestrator --prompt ${shellQuotePrompt(telemetryPrompt)}`
    );

    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('devhub:run-agent', {
          detail: {
            taskId: agentId,
            command,
            selectedAgent: 'sdd-orchestrator',
            launchOrigin: 'dashboard-launch',
            promptSummary: promptHint,
          },
        })
      );
    }, 150);
  };

  return (
    <div className="bg-gradient-to-r from-[#58A6FF]/10 to-[#8957e5]/10 border border-[#58A6FF]/30 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center mb-6 shadow-sm">
      <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#58A6FF] to-[#8957e5] flex items-center justify-center shadow-lg">
          <Bot className="w-5 h-5 text-white" strokeWidth={1.5} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">Orquestador IA</h3>
          <p className="text-xs text-text-muted mt-1">
            Budget: {docopsBudget.max_tokens_context}/{docopsBudget.max_expansions}/
            {docopsBudget.expansion_step_tokens}
          </p>
        </div>
      </div>
      <form onSubmit={handleLaunch} className="flex-1 w-full relative group">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="¿Qué nueva feature querés construir hoy? (Ej: Añadir un sistema de Autenticación JWT)"
          className="w-full bg-[#0d1117]/80 backdrop-blur-sm border border-[#30363d] rounded-lg pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:border-[#58A6FF]/70 focus:ring-1 focus:ring-[#58A6FF]/20 transition-all placeholder-[#484F58]"
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-[#58A6FF]/10 text-[#58A6FF] hover:bg-[#58A6FF] hover:text-white rounded-md transition-all disabled:opacity-50 disabled:hover:bg-[#58A6FF]/10 disabled:hover:text-[#58A6FF]"
        >
          <Zap className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
