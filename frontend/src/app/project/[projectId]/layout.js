'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';
import { mockProjects } from '@/data/projects';

export default function ProjectLayout({ children }) {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const project = mockProjects.find((p) => p.id === params.projectId);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (!user.mfaVerified) {
        router.replace('/auth/verify-2fa');
      } else if (!project) {
        router.replace('/hub');
      }
    }
  }, [user, loading, project, router]);

  if (loading || !user?.mfaVerified || !project) return null;

  return (
    <div className="flex h-screen bg-[#0D1117] overflow-hidden">
      <WorkspaceSidebar
        project={project}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <main
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#21262D transparent' }}
      >
        {children}
      </main>
    </div>
  );
}
