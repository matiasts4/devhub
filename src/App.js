import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useParams,
  useLocation,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import '@/App.css';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import ProjectHub from './views/ProjectHub';
import ProjectDashboard from './views/ProjectDashboard';
import Tareas from './views/Tareas';
import CodeEditor from './views/CodeEditor';
import Scaffolding from './views/Scaffolding';
import Roadmap from './views/Roadmap';
import Historial from './views/Historial';
import Conexiones from './views/Conexiones';
import Ajustes from './views/Ajustes';
import AgentHub from './views/AgentHub';
import SwarmControl from './views/SwarmControl';
import TelegramMonitor from './views/TelegramMonitor';
import { createClient } from '@/lib/db/localSupabase';
import { Loader2 } from 'lucide-react';
import {
  applyThemeToDocument,
  getStoredTheme,
  applyZoomToDocument,
  getStoredZoom,
  setZoom,
} from '@/lib/theme/themes';
import TerminalWorkspacesManager from './components/TerminalWorkspacesManager';
import { getUIPrefs, saveUIPref } from '@/lib/uiState';
import NotificationCenter from './components/NotificationCenter';
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

function WorkspaceLayout() {
  const { projectId } = useParams();
  const location = useLocation();
  const isTerminalRoute = location.pathname.includes('/terminales');

  const [collapsed, setCollapsed] = useState(() => {
    if (!projectId) return false;
    return Boolean(getUIPrefs(projectId).sidebarCollapsed);
  });
  const [uiPrefsReady, setUiPrefsReady] = useState(false);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);
  const pollRef = useRef(null);

  const loadProject = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').eq('id', projectId).single();
    setProject(data || null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (!projectId) return;

    const prefs = getUIPrefs(projectId);
    setUiPrefsReady(false);
    setCollapsed(Boolean(prefs.sidebarCollapsed));
    setUiPrefsReady(true);
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !uiPrefsReady) return;
    saveUIPref(projectId, 'sidebarCollapsed', collapsed);
  }, [projectId, collapsed, uiPrefsReady]);

  // Polling for project updates (replaces Supabase realtime in local mode)
  useEffect(() => {
    if (!projectId) return;

    const refreshProject = async () => {
      const { data } = await supabase.from('projects').select('*').eq('id', projectId).single();
      if (data) setProject(data);
    };

    // Poll every 10 seconds
    pollRef.current = setInterval(refreshProject, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId, supabase]);

  // Auto-calcula progress cuando el agente IA crea/completa tareas
  useEffect(() => {
    if (!projectId) return;

    const recalcProgress = async () => {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('status')
        .eq('project_id', projectId);
      if (!tasks || tasks.length === 0) return;
      const total = tasks.length;
      const done = tasks.filter((t) =>
        ['completed', 'done'].includes((t.status || '').toLowerCase())
      ).length;
      const newProgress = Math.round((done / total) * 100);

      // Update sidebar/UI immediately, even if persistence fails.
      setProject((prev) => (prev ? { ...prev, progress: newProgress } : prev));

      await supabase.from('projects').update({ progress: newProgress }).eq('id', projectId);
    };

    recalcProgress();

    // Poll task changes every 15 seconds
    const taskPoll = setInterval(recalcProgress, 15000);

    return () => {
      clearInterval(taskPoll);
    };
  }, [projectId, supabase]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-app">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  if (!project) return <Navigate to="/hub" replace />;

  return (
    <div className="relative flex h-screen overflow-hidden bg-surface-app text-text-primary">
      <WorkspaceSidebar project={project} collapsed={collapsed} />

      {/* Lateral floating sidebar toggle */}
      <button
        data-testid="sidebar-toggle-float"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        className="absolute z-30 w-7 h-7 rounded-full border flex items-center justify-center transition-all hover:scale-105 cursor-pointer"
        style={{
          left: collapsed ? 56 : 280,
          top: '52%',
          transform: 'translate(-50%, -50%)',
          borderColor: 'color-mix(in srgb, var(--accent-primary) 35%, var(--border-subtle))',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--surface-card) 95%, transparent), color-mix(in srgb, var(--surface-elevated) 80%, transparent))',
          color: 'var(--text-muted)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        }}
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.8} />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.8} />
        )}
      </button>

      <div className="flex-1 flex flex-col min-w-0 bg-surface-app relative">
        {/* Floating command topbar */}
        {!isTerminalRoute && (
          <header
            className="sticky top-0 z-20 px-6 pt-4"
            style={{
              background:
                'linear-gradient(180deg, color-mix(in srgb, var(--surface-app) 96%, transparent), transparent)',
            }}
          >
            <div
              className="rounded-2xl border px-4 py-2.5 flex items-center justify-between"
              style={{
                borderColor: 'var(--border-subtle)',
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--surface-card) 90%, transparent), color-mix(in srgb, var(--surface-elevated) 65%, transparent))',
                boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--accent-primary) 35%, transparent)',
                    background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  <Sparkles className="w-3 h-3" /> DevHub Command Deck
                </span>
                <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                  {project?.name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <NotificationCenter projectId={project?.id} variant="topbar" />
                <span
                  className="text-xs px-2 py-0.5 rounded-full border"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-muted)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Ruta: {location.pathname.split('/').slice(-1)[0]}
                </span>
              </div>
            </div>
          </header>
        )}

        {/* Main Routed Content */}
        <main
          className="h-full w-full overflow-y-auto"
          style={{
            display: isTerminalRoute ? 'none' : 'block',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border-subtle) transparent',
          }}
        >
          <Outlet context={{ project }} />
        </main>

        {/* Persistent Terminal IDE Container */}
        <div
          className="absolute inset-0 z-10 bg-[#0d0d0d]"
          style={{ display: isTerminalRoute ? 'block' : 'none' }}
        >
          {project && (
            <TerminalWorkspacesManager cwd={project.local_path} isVisible={isTerminalRoute} />
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    applyThemeToDocument(getStoredTheme());
    applyZoomToDocument(getStoredZoom());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-')) {
        e.preventDefault();
        const currentZoom = getStoredZoom();
        if (e.key === '=' || e.key === '+') {
          if (currentZoom < 2) setZoom(currentZoom + 0.1);
        } else {
          if (currentZoom > 0.5) setZoom(currentZoom - 0.1);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        setZoom(1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (typeof window === 'undefined') return;

    const clearStalePwaState = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ('caches' in window) {
          const keys = await window.caches.keys();
          await Promise.all(keys.map((key) => window.caches.delete(key)));
        }
      } catch (error) {
        console.warn('No se pudo limpiar el estado PWA en desarrollo:', error);
      }
    };

    clearStalePwaState();
  }, []);

  return (
    <div className="App">
      <HashRouter>
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          toastOptions={{
            style: {
              background: 'var(--surface-card)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            },
          }}
        />
        <Routes>
          <Route path="/" element={<Navigate to="/hub" replace />} />
          <Route path="/hub" element={<ProjectHub />} />
          <Route path="/project/:projectId" element={<WorkspaceLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ProjectDashboard />} />
            <Route path="tareas" element={<Tareas />} />
            <Route path="editor" element={<CodeEditor />} />
            <Route path="scaffolding" element={<Scaffolding />} />
            <Route path="roadmap" element={<Roadmap />} />
            <Route path="historial" element={<Historial />} />
            <Route path="conexiones" element={<Conexiones />} />
            <Route path="ajustes" element={<Ajustes />} />
            <Route path="agenthub" element={<AgentHub />} />
            <Route path="swarm" element={<SwarmControl />} />
            <Route path="telegram" element={<TelegramMonitor />} />

            {/* Dummy route for terminales to avoid Router 404, actual render is done globally */}
            <Route path="terminales" element={<div />} />
          </Route>
        </Routes>
      </HashRouter>
    </div>
  );
}

export default App;
