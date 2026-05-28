import { Fragment } from 'react';

export function getWorkspacePageTitleProjectBadgeProps() {
  return {
    className:
      'text-xs px-2 py-0.5 rounded-[var(--chrome-radius-control)] border-[length:var(--chrome-border-width)] truncate max-w-[220px]',
    style: {
      borderColor: 'var(--chrome-border-color)',
      background: 'var(--chrome-control-fill)',
      boxShadow: 'var(--chrome-shadow-control)',
      color: 'var(--text-muted)',
    },
  };
}

export default function WorkspacePageTitle({
  icon: Icon,
  title,
  projectName,
  badges = [],
  iconClassName = 'w-4 h-4',
}) {
  const projectBadgeProps = getWorkspacePageTitleProjectBadgeProps();

  return (
    <div className="flex items-center gap-3 flex-wrap min-w-0">
      {Icon ? (
        <Icon className={iconClassName} strokeWidth={1.5} style={{ color: 'var(--accent-primary)' }} />
      ) : null}

      <h1 className="font-mono text-base font-bold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h1>

      {projectName ? (
        <span data-chrome-surface="project-badge" {...projectBadgeProps}>
          {projectName}
        </span>
      ) : null}

      {badges.map((badge, idx) => (
        <Fragment key={idx}>{badge}</Fragment>
      ))}
    </div>
  );
}
