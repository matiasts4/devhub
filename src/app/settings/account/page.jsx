'use client';

import { createClient } from '@/lib/db/localClient';
import { UiHeader } from '@/components/ui/system';
import { ProfileSection } from '@/components/settings/ProfileSection';

export default function AccountPage() {
  const db = createClient();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <UiHeader>
        <UiHeader.Title>Account</UiHeader.Title>
      </UiHeader>
      <ProfileSection db={db} />
    </div>
  );
}
