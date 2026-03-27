'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import ProjectHub from '@/pages/ProjectHub';

export default function HubPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (!user.mfaVerified) {
        router.replace('/auth/verify-2fa');
      }
    }
  }, [user, loading, router]);

  if (loading || !user?.mfaVerified) return null;

  return <ProjectHub />;
}
