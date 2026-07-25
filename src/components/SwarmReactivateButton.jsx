'use client';

/**
 * SwarmReactivateButton — React button to reactivate an idle/paused swarm session.
 * POSTs to `/api/agenthub/swarm/{missionId}/message` with session_id + continuation prompt.
 *
 * @param {object} props
 * @param {string} props.missionId - The mission ID
 * @param {string} [props.agentId] - The agent/session ID to reactivate
 * @param {string} [props.sessionId] - The session ID to reactivate
 * @param {string} [props.continuationPrompt] - Optional prompt to resume with
 * @param {'idle'|'paused'|'active'|'completed'} [props.sessionStatus] - Current session status
 * @param {function} [props.onReactivate] - Callback when reactivation succeeds
 * @param {function} [props.onError] - Callback when reactivation fails
 * @param {string} [props.className] - Additional CSS classes
 */
export default function SwarmReactivateButton({
  missionId,
  agentId,
  sessionId,
  continuationPrompt = null,
  sessionStatus = 'idle',
  onReactivate,
  onError,
  className = '',
}) {
  // Disable if no session exists or if already active
  const canReactivate = sessionId && sessionStatus !== 'active';

  const handleReactivate = async () => {
    if (!canReactivate) return;

    try {
      const body = {
        mission_id: missionId,
        recipient: agentId, // who to send to
        session_id: sessionId,
        action: 'reactivate',
        continuation_prompt:
          continuationPrompt || 'Resume from last checkpoint. Continue with the current task.',
      };

      const res = await fetch(`/api/agenthub/swarm/${missionId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      onReactivate?.(data);
    } catch (err) {
      console.error('[SwarmReactivateButton] Reactivation failed:', err.message);
      onError?.(err);
    }
  };

  return (
    <button
      onClick={handleReactivate}
      disabled={!canReactivate}
      title={
        !canReactivate
          ? sessionStatus === 'active'
            ? 'Session is already active'
            : 'No session to reactivate'
          : `Reactivate session ${sessionId?.slice(0, 8)}...`
      }
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1
        text-[11px] font-medium rounded-md border transition-colors
        ${
          canReactivate
            ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/30 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 cursor-pointer'
            : 'bg-[var(--chrome-control-fill)] border-[var(--chrome-border-color)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
        }
        ${className}
      `}
    >
      {/* Play icon */}
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
      <span>Reactivate</span>
    </button>
  );
}
