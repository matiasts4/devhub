'use client';

import { Clock, Check, X, Play, Loader2, CheckCheck, RotateCcw, Pause } from 'lucide-react';

/**
 * STATUS_ICONS — semantic icon per status value (T11).
 *
 * Props:
 *   status: string
 */
const STATUS_ICON_MAP = {
  requested:       { Icon: Clock,      props: { className: 'w-3 h-3' } },
  policy_approved:  { Icon: Check,     props: { className: 'w-3 h-3 text-green-600' } },
  policy_denied:   { Icon: X,         props: { className: 'w-3 h-3 text-red-600' } },
  invoked:         { Icon: Play,      props: { className: 'w-3 h-3 text-blue-600' } },
  running:         { Icon: Loader2,   props: { className: 'w-3 h-3 text-blue-500 animate-spin' } },
  completed:       { Icon: CheckCheck, props: { className: 'w-3 h-3 text-green-600' } },
  failed:          { Icon: X,         props: { className: 'w-3 h-3 text-red-600' } },
  rolled_back:     { Icon: RotateCcw, props: { className: 'w-3 h-3 text-orange-600' } },
  deferred:        { Icon: Pause,     props: { className: 'w-3 h-3 text-yellow-600' } },
};

export function StatusIcon({ status }) {
  const entry = STATUS_ICON_MAP[status];
  if (!entry) return null;
  const { Icon, props } = entry;
  return <Icon {...props} />;
}

export default StatusIcon;