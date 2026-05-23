import { formatToken, panelShellStyle } from './utils';

export default function ControlRoomMetricsPanel({ header = {} }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Agentes" value={`${header.active ?? 0}/${header.max ?? 0} activos`} />
      <MetricCard label="Cola" value={`${header.queue_depth ?? 0} en cola`} />
      <MetricCard label="Autoridad" value={formatToken(header.authority)} />
      <MetricCard label="Frescura" value={formatToken(header.freshness)} />
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border px-3 py-3" style={panelShellStyle()}>
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
