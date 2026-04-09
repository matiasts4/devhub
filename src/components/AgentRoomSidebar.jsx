import React, { useState, useCallback, useEffect } from 'react';
import { Bot, ChevronRight, Maximize2, Minimize2, Clock, Zap, Play, Terminal, Square } from 'lucide-react';
import useAgentRegistryPolling from '@/hooks/useAgentRegistryPolling';
import AgentCard from './AgentCard';
import AgentLaunchDropdown from './AgentLaunchDropdown';

/**
 * AgentRoomSidebar — Sidebar with tabbed view for Active / History agents.
 *
 * Activity tab: Shows active agents (registry + live OpenCode sessions).
 * History tab: Shows inactive agents and past OpenCode sessions with "Resume" button.
 *
 * @param {string} projectId
 * @param {function} onAgentClick — focuses the terminal panel for this agent
 * @param {function} onReopenSession — (session) => opens an OpenCode session in a new panel
 * @param {function} onMaximizeToggle
 * @param {boolean} isMaximized
 * @param {Array} workspaces
 * @param {object} activePanelIds
 * @param {boolean} isVisible
 * @param {function} onToggleVisibility
 */
export default function AgentRoomSidebar({
  projectId,
  onAgentClick,
  onReopenSession,
  onTerminateAgent,
  onMaximizeToggle,
  isMaximized,
  workspaces,
  activePanelIds,
  isVisible,
  onToggleVisibility,
}) {
  const { activeAgents, inactiveAgents, loading, error } = useAgentRegistryPolling(projectId);
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [activeTab, setActiveTab] = useState('activity'); // 'activity' | 'history'
  const [, setTick] = useState(0);

  // Re-render every second so elapsed times update in real-time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAgentClick = useCallback(
    (agent) => {
      setSelectedAgentId(agent.agent_id);
      if (onAgentClick) onAgentClick(agent);
    },
    [onAgentClick]
  );

  const handleResumeSession = useCallback(
    (agent) => {
      if (!agent._isOpenCodeSession || !agent._opencodeSessionId) return;
      if (onReopenSession) {
        onReopenSession({
          id: agent._opencodeSessionId,
          title: agent._displayName,
          directory: agent._sessionDirectory,
        });
      }
    },
    [onReopenSession]
  );

  const handleTerminate = useCallback(
    (e, agent) => {
      e.stopPropagation();
      if (!agent._isOpenCodeSession || !agent._opencodeSessionId) return;
      // Write to terminated list — next poll will pick this up and move to History
      try {
        const terminated = JSON.parse(localStorage.getItem('devhub_oc_terminated') || '{}');
        terminated[agent._opencodeSessionId] = Date.now();
        localStorage.setItem('devhub_oc_terminated', JSON.stringify(terminated));
      } catch {
        // ignore
      }
      if (onTerminateAgent) onTerminateAgent(agent);
    },
    [onTerminateAgent]
  );

  const getElapsedMs = (agent) => {
    const launched = agent?._launchedAt || agent?.launchedAt;
    if (launched) return Date.now() - launched;

    const hb = agent?.last_heartbeat;
    if (hb) {
      const parsed = new Date(hb).getTime();
      if (Number.isFinite(parsed)) return Date.now() - parsed;
    }
    return 0;
  };

  const formatElapsed = (ms) => {
    if (ms === null || ms === undefined || ms < 0) return '—';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  if (!isVisible) {
    return (
      <button
        onClick={onToggleVisibility}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center w-5 h-12 rounded-l-md transition-colors"
        style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRight: 'none' }}
        title="Show Agent Room Sidebar"
      >
        <ChevronRight className="w-3 h-3 text-gray-400" />
      </button>
    );
  }

  const displayAgents = activeTab === 'activity' ? activeAgents : inactiveAgents;

  return (
    <div
      className="flex flex-col h-full bg-[#0d1018]"
      style={{ width: '280px', minWidth: '280px' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between h-10 px-3 shrink-0 border-b border-[#2a2a2a]"
        style={{ background: '#111826' }}
      >
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-gray-200">Agent Room</span>
          {activeAgents.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
              {activeAgents.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onMaximizeToggle}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            title={isMaximized ? 'Restore layout' : 'Maximize terminal'}
          >
            {isMaximized ? (
              <Minimize2 className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
          <button
            onClick={onToggleVisibility}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors"
            title="Hide sidebar"
          >
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Tab Selector — Activity / History */}
      <div
        className="flex shrink-0 border-b border-[#2a2a2a] px-2 pt-1.5"
        style={{ background: '#111826' }}
      >
        <button
          onClick={() => setActiveTab('activity')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-medium transition-all"
          style={{
            background: activeTab === 'activity' ? '#1a2744' : 'transparent',
            color: activeTab === 'activity' ? '#e2e8f0' : '#6b7280',
            borderBottom: activeTab === 'activity' ? '2px solid #3b82f6' : '2px solid transparent',
          }}
        >
          <Zap className="w-3 h-3" />
          <span>Activity</span>
          {activeAgents.length > 0 && (
            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">
              {activeAgents.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs font-medium transition-all"
          style={{
            background: activeTab === 'history' ? '#1a2744' : 'transparent',
            color: activeTab === 'history' ? '#e2e8f0' : '#6b7280',
            borderBottom: activeTab === 'history' ? '2px solid #3b82f6' : '2px solid transparent',
          }}
        >
          <Clock className="w-3 h-3" />
          <span>History</span>
          {inactiveAgents.length > 0 && (
            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">
              {inactiveAgents.length}
            </span>
          )}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && displayAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <Bot className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-xs">Loading agents...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-red-400">
            <span className="text-xs">{error}</span>
          </div>
        ) : displayAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-4 text-center">
            <Bot className="w-12 h-12 mb-3 text-gray-600" />
            <span className="text-sm font-medium text-gray-400 mb-1">
              {activeTab === 'activity' ? 'No active agents' : 'No history yet'}
            </span>
            <span className="text-xs text-gray-600">
              {activeTab === 'activity'
                ? 'Launch an agent or open OpenCode to see it here'
                : 'Past sessions will appear here'}
            </span>
          </div>
        ) : (
          <div className="p-2 flex flex-col gap-1.5">
            {displayAgents.map((agent) => {
              const isOCSession = agent._isOpenCodeSession;
              const canResume = isOCSession && activeTab === 'history';

              return (
                <div key={agent.agent_id} className="relative group/card">
                  <AgentCard
                    agent={agent}
                    isActive={activeTab === 'activity'}
                    isSelected={selectedAgentId === agent.agent_id}
                    onClick={handleAgentClick}
                    elapsedMs={getElapsedMs(agent)}
                  />

                  {/* Resume button for inactive OpenCode sessions */}
                  {canResume && onReopenSession && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResumeSession(agent);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold opacity-0 group-hover/card:opacity-100 transition-opacity"
                      style={{
                        background: '#16233a',
                        border: '1px solid #2a3f5f',
                        color: '#6da9ff',
                      }}
                      title={`Resume: ${agent._displayName}`}
                    >
                      <Play className="w-2.5 h-2.5" />
                      Resume
                    </button>
                  )}

                  {/* End button + live indicator for active OpenCode sessions */}
                  {isOCSession && activeTab === 'activity' && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      {/* Live badge — hidden on hover to show End button */}
                      <span
                        className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded group-hover/card:hidden"
                        style={{ background: '#0e1f10', color: '#3fb950', border: '1px solid #2ea04355' }}
                      >
                        <Terminal className="w-2.5 h-2.5" />
                        live
                      </span>
                      {/* End button — visible on hover */}
                      <button
                        onClick={(e) => handleTerminate(e, agent)}
                        className="hidden group-hover/card:flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-opacity"
                        style={{
                          background: '#1f0e0e',
                          border: '1px solid #5f2a2a',
                          color: '#f87171',
                        }}
                        title="End session"
                      >
                        <Square className="w-2.5 h-2.5" />
                        End
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Launch Dropdown at Bottom */}
      <AgentLaunchDropdown projectId={projectId} onLaunch={() => {}} />
    </div>
  );
}
