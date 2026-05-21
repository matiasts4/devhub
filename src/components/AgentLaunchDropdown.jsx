import React, { useState, useCallback } from 'react';
import { ChevronDown, Rocket, Bot } from 'lucide-react';

/**
 * AgentLaunchDropdown — Dropdown at sidebar bottom for selecting and launching agents.
 *
 * On selection dispatches `devhub:run-agent` event with { agentName, taskId }.
 * Integrates with existing terminal panel creation.
 */
export default function AgentLaunchDropdown({ projectId, onLaunch }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);

  const agentOptions = [
    { id: 'gentleman', name: 'Gentleman', description: 'General-purpose coding agent' },
    { id: 'gemini', name: 'Gemini', description: 'Google Gemini coding assistant' },
    {
      id: 'sdd-orchestrator',
      name: 'SDD Orchestrator',
      description: 'Spec-Driven Development orchestrator',
    },
    { id: 'worker', name: 'Worker', description: 'Task execution worker agent' },
  ];

  const handleSelect = useCallback((agent) => {
    setSelectedAgent(agent);
    setIsOpen(false);
  }, []);

  const handleLaunch = useCallback(() => {
    if (!selectedAgent) return;

    const taskId = `agent-${Date.now()}-${selectedAgent.id}`;
    const command = `opencode --agent ${selectedAgent.id}`;

    // Dispatch the run-agent event that TerminalWorkspacesManager listens to
    window.dispatchEvent(
      new CustomEvent('devhub:run-agent', {
        detail: {
          taskId,
          command,
          selectedAgent: selectedAgent.id,
          launchOrigin: 'agent-room-sidebar',
          promptSummary: `Launch ${selectedAgent.name}`,
          taskTitle: `Agent: ${selectedAgent.name}`,
        },
      })
    );

    if (onLaunch) {
      onLaunch({ agent: selectedAgent, taskId });
    }

    setSelectedAgent(null);
  }, [selectedAgent, onLaunch]);

  return (
    <div className="border-t border-[#2a2a2a] p-3">
      {/* Agent Selector */}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: selectedAgent ? '#16233a' : '#111826',
            border: '1px solid #2a3f5f',
            color: selectedAgent ? '#6da9ff' : '#9ca3af',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {selectedAgent ? selectedAgent.name : 'Select an agent...'}
            </span>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div
            className="absolute bottom-full left-0 right-0 mb-1 rounded-lg overflow-hidden z-50 shadow-xl"
            style={{
              background: '#0d1320',
              border: '1px solid #273146',
            }}
          >
            {agentOptions.map((agent) => (
              <button
                key={agent.id}
                onClick={() => handleSelect(agent)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#162033]"
              >
                <Bot className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-200">{agent.name}</div>
                  <div className="text-[10px] text-gray-500 truncate">{agent.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Launch Button */}
      <button
        onClick={handleLaunch}
        disabled={!selectedAgent}
        className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: selectedAgent ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#1a1a1a',
          color: selectedAgent ? '#ffffff' : '#6b7280',
          border: selectedAgent ? '1px solid #3b82f6' : '1px solid #2a2a2a',
        }}
      >
        <Rocket className="w-3.5 h-3.5" />
        <span>Launch Agent</span>
      </button>
    </div>
  );
}
