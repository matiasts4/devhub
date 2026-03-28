'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';
import { createClient } from '@/lib/supabase/client';

export default function ProjectLayoutClient({ children }) {
  const params = useParams();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [project, setProject] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [projectLoading, setProjectLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!params?.projectId) return;
    const supabase = createClient();
    supabase
      .from('projects')
      .select('*')
      .eq('id', params.projectId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          router.replace('/hub');
        } else {
          setProject(data);
        }
        setProjectLoading(false);
      });
  }, [params?.projectId, router]);

  if (loading || projectLoading) {
    return (
      <div className="flex h-screen bg-surface-app items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#388BFD] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !project) return null;

  return (
    <div className="flex h-screen bg-surface-app overflow-hidden">
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
