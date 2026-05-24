import { Fragment } from 'react';

export default function WorkspacePageTitle({
  icon: Icon,
  title,
  projectName,
  badges = [],
  iconClassName = 'w-4 h-4',
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap min-w-0">
      {Icon ? (
        <Icon className={iconClassName} strokeWidth={1.5} style={{ color: 'var(--accent-primary)' }} />
      ) : null}

      <h1 className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h1>

      {projectName ? (
        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted truncate max-w-[220px]">
          {projectName}
        </span>
      ) : null}

      {badges.map((badge, idx) => (
        <Fragment key={idx}>{badge}</Fragment>
      ))}
    </div>
  );
}