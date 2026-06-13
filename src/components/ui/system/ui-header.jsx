import React from 'react';
import { cn } from '@/lib/utils';

function UiHeader({ children, className, sticky = false, ...props }) {
  const childrenArray = React.Children.toArray(children);

  const breadcrumbs = childrenArray.find((child) => child?.type === UiHeader.Breadcrumbs);
  const title = childrenArray.find((child) => child?.type === UiHeader.Title);
  const tabs = childrenArray.find((child) => child?.type === UiHeader.Tabs);
  const actions = childrenArray.find((child) => child?.type === UiHeader.Actions);

  return (
    <header
      className={cn(
        'flex items-center justify-between px-4 h-14 border-b border-[var(--border-subtle)]',
        sticky && 'sticky top-0 z-10 core-sticky-header',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        {breadcrumbs}
        {title}
        {tabs}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

function Breadcrumbs({ children, className }) {
  if (!children) return null;
  return <nav className={cn('text-sm text-[var(--text-muted)]', className)}>{children}</nav>;
}

function Title({ children, className }) {
  if (!children) return null;
  return (
    <h1 className={cn('text-base font-semibold text-[var(--text-primary)] truncate', className)}>
      {children}
    </h1>
  );
}

function Tabs({ children, className }) {
  if (!children) return null;
  return <div className={cn('flex items-center gap-1', className)}>{children}</div>;
}

function Actions({ children, className }) {
  if (!children) return null;
  return <div className={cn('flex items-center gap-2', className)}>{children}</div>;
}

UiHeader.Breadcrumbs = Breadcrumbs;
UiHeader.Title = Title;
UiHeader.Tabs = Tabs;
UiHeader.Actions = Actions;

export { UiHeader };
