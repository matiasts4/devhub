import React from 'react';
import { Bot, Clock, Terminal } from 'lucide-react';

/**
 * AgentCard — Individual agent card for the sidebar.
 *
 * Displays: avatar, name, model, elapsed time (top-right), status dot.
 * Active/selected: blue border (#3b82f6). Inactive: gray border (#6b7280).
 * OpenCode sessions: teal/green accent, Terminal icon.
 *
 * @param {object} agent — agent_registry row or virtual OpenCode agent
 * @param {boolean} isActive — derived from status + heartbeat
 * @param {boolean} isSelected — currently focused panel
 * @param {function} onClick — triggers focus on click
 * @param {number} elapsedMs — time since last_heartbeat or launchedAt
 */
export default function AgentCard({ agent, isActive, isSelected, onClick, elapsedMs }) {
  if (!agent) return null;

  const isOCSession = Boolean(agent._isOpenCodeSession);

  // Display name: prefer session title for OpenCode, then metadata, then agent type
  const displayName =
    agent._displayName ||
    agent.nombre ||
    agent.profile_name ||
    `Session ${String(agent.agent_id || '').slice(0, 8)}`;

  const agentType = isOCSession ? null : (agent.nombre || agent._selectedAgent || null);
  const model = (!isOCSession && agent.modelo_llm && agent.modelo_llm !== 'N/A')
    ? agent.modelo_llm
    : null;

  // Colors: OpenCode sessions get a teal/green accent, regular agents get blue
  const accentColor = isOCSession ? '#3fb950' : '#3b82f6';
  const statusColor = isActive
    ? (isOCSession ? '#3fb950' : '#22c55e')
    : '#6b7280';
  const borderColor = isSelected
    ? accentColor
    : (isActive ? `${accentColor}66` : '#374151');
  const bgColor = isSelected
    ? (isOCSession ? '#0e1f10' : '#16233a')
    : (isActive ? (isOCSession ? '#0a180c' : '#0f1626') : '#111826');

  // Format elapsed time — compact like "07:51"
  const formatElapsed = (ms) => {
    if (ms === null || ms === undefined || ms < 0) return '—';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleClick = () => {
    if (onClick) onClick(agent);
  };

  const AvatarIcon = isOCSession ? Terminal : Bot;
  const avatarBg = isOCSession
    ? (isActive ? '#0e1f10' : '#0d1a0e')
    : (isActive ? '#16233a' : '#1a1a1a');
  const avatarBorder = isOCSession
    ? (isActive ? '#2ea04355' : '#2a3d2a')
    : (isActive ? '#2a3f5f' : '#2a2a2a');
  const avatarColor = isOCSession
    ? (isActive ? '#3fb950' : '#4b7c52')
    : (isActive ? '#6da9ff' : '#6b7280');

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all cursor-pointer text-left group"
      style={{
        height: '64px',
        border: `1px solid ${borderColor}`,
        background: bgColor,
        boxShadow: isSelected ? `0 0 0 1px ${accentColor}80` : 'none',
      }}
    >
      {/* Status Dot */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{
          backgroundColor: statusColor,
          boxShadow: isActive ? `0 0 6px ${statusColor}` : 'none',
        }}
      />

      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{
          background: avatarBg,
          border: `1px solid ${avatarBorder}`,
        }}
      >
        <AvatarIcon className="w-4 h-4" style={{ color: avatarColor }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 pr-1">
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-semibold truncate"
            style={{ color: isActive ? '#e2e8f0' : '#9ca3af' }}
          >
            {displayName}
          </span>
          {elapsedMs !== undefined && (
            <span
              className="text-[11px] font-mono shrink-0 ml-2"
              style={{ color: isActive ? (isOCSession ? '#6ee7b7' : '#a5b4fc') : '#6b7280' }}
            >
              {formatElapsed(elapsedMs)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {isOCSession && (
            <span className="text-[11px] font-medium" style={{ color: isActive ? '#3fb95099' : '#4b5563' }}>
              OpenCode
            </span>
          )}
          {agentType && <span className="text-[11px] text-gray-500 truncate">{agentType}</span>}
          {model && <span className="text-[11px] text-gray-600 truncate">· {model}</span>}
          {isSelected && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
              style={{ background: `${accentColor}33`, color: accentColor }}>
              Active
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
