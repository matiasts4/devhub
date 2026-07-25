'use client';

/**
 * StageTag — coloured pill for the stage key (D-7).
 *
 * Props:
 *   stage: string
 *   status?: string — used to colour execution_progress (green=completed, red=failed)
 */

const STAGE_COLORS = {
  action_request: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Action Request' },
  policy_evaluation: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Policy Evaluation' },
  tool_invocation: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Tool Invocation' },
  execution_progress: { bg: 'bg-green-100', text: 'text-green-700', label: 'Execution Progress' },
  rollback: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Rollback' },
  deferred: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Deferred' },
  audit_recorded: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Audit Recorded' },
};

export default function StageTag({ stage, status }) {
  const base = STAGE_COLORS[stage] || { bg: 'bg-gray-100', text: 'text-gray-500', label: stage };

  let label = base.label;
  let textColor = base.text;
  let bgColor = base.bg;

  if (stage === 'execution_progress') {
    if (status === 'completed') {
      textColor = 'text-green-700';
      bgColor = 'bg-green-100';
      label = 'Completed';
    } else if (status === 'failed') {
      textColor = 'text-red-700';
      bgColor = 'bg-red-100';
      label = 'Failed';
    }
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-mono ${bgColor} ${textColor}`}
    >
      {label}
    </span>
  );
}
