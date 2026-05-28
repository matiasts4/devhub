import React from 'react';
import { cn } from '@/lib/utils';

function UiShell({ children, className }) {
  return <div className={cn('flex h-full w-full overflow-hidden', className)}>{children}</div>;
}

function Header({ children, className }) {
  if (!children) return null;
  return (
    <header
      className={cn(
        'flex-shrink-0 flex items-center h-14 px-4 border-b border-[var(--border-subtle)]',
        className
      )}
    >
      {children}
    </header>
  );
}

function Sidebar({ children, className }) {
  if (!children) return null;
  return (
    <aside
      className={cn(
        'flex-shrink-0 w-64 h-full overflow-y-auto border-r border-[var(--border-subtle)]',
        className
      )}
    >
      {children}
    </aside>
  );
}

function Content({ children, className }) {
  return <main className={cn('flex-1 h-full overflow-y-auto', className)}>{children}</main>;
}

UiShell.Header = Header;
UiShell.Sidebar = Sidebar;
UiShell.Content = Content;

export { UiShell };
