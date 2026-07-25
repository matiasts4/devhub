'use client';

import { UiShell } from '@/components/ui/system/ui-shell';
import { UiHeader } from '@/components/ui/system/ui-header';
import { usePathname } from 'next/navigation';

function titleFromPathname(pathname) {
  const segment = pathname?.split('/').filter(Boolean).pop() || 'settings';
  return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SettingsLayout({ children }) {
  const pathname = usePathname();
  const title = titleFromPathname(pathname);

  return (
    <UiShell className="flex-col">
      <UiHeader data-testid="ui-header">
        <UiHeader.Title>{title}</UiHeader.Title>
      </UiHeader>
      <UiShell.Content>{children}</UiShell.Content>
    </UiShell>
  );
}
