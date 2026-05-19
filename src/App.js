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
import SwarmControl from './views/SwarmControl';
import TelegramMonitor from './views/TelegramMonitor';
import { createClient } from '@/lib/db/localClient';
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
import PageHeader from './components/PageHeader';
import { getLegacyWorkspaceRedirectPath } from '@/lib/workspaceRouting';

const PAGE_LABELS = {
  dashboard: 'dashboard',
  tareas: 'tareas',
  editor: 'editor',
  scaffolding: 'scaffolding',
  roadmap: 'roadmap',
  historial: 'historial',
  conexiones: 'conexiones',
  ajustes: 'ajustes',
  swarm: 'swarm control',
  telegram: 'telegram monitor',
  planning: 'planning',
};

function WorkspaceLayout() {
  const { projectId } = useParams();
  const location = useLocation();
  const isTerminalRoute = location.pathname.includes('/terminales');
  const currentPage = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || 'dashboard';
  }, [location.pathname]);
  const shouldShowGlobalHeader = !isTerminalRoute;

  const [collapsed, setCollapsed] = useState(() => {
    if (!projectId) return false;
    return Boolean(getUIPrefs(projectId).sidebarCollapsed);
  });
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [uiPrefsReady, setUiPrefsReady] = useState(false);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const db = useMemo(() => createClient(), []);
  const pollRef = useRef(null);

  const loadProject = useCallback(async () => {
    const { data } = await db.from('projects').select('*').eq('id', projectId).single();
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

  // Listen for terminal maximize toggle events
  useEffect(() => {
    const handleMaximizeToggle = (e) => {
      setIsTerminalMaximized(e.detail?.isMaximized ?? false);
    };
    window.addEventListener('devhub:toggle-maximize', handleMaximizeToggle);
    return () => window.removeEventListener('devhub:toggle-maximize', handleMaximizeToggle);
  }, []);

  useEffect(() => {
    if (!projectId || !uiPrefsReady) return;
    saveUIPref(projectId, 'sidebarCollapsed', collapsed);
  }, [projectId, collapsed, uiPrefsReady]);

  // Polling for project updates (local mode)
  useEffect(() => {
    if (!projectId) return;

    const refreshProject = async () => {
      const { data } = await db.from('projects').select('*').eq('id', projectId).single();
      if (data) setProject(data);
    };

    // Poll every 10 seconds
    pollRef.current = setInterval(refreshProject, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [projectId, db]);

  // Auto-calcula progress cuando el agente IA crea/completa tareas
  useEffect(() => {
    if (!projectId) return;

    const recalcProgress = async () => {
      const { data: tasks } = await db.from('tasks').select('status').eq('project_id', projectId);
      if (!tasks || tasks.length === 0) return;
      const total = tasks.length;
      const done = tasks.filter((t) =>
        ['completed', 'done'].includes((t.status || '').toLowerCase())
      ).length;
      const newProgress = Math.round((done / total) * 100);

      // Update sidebar/UI immediately, even if persistence fails.
      setProject((prev) => (prev ? { ...prev, progress: newProgress } : prev));

      await db.from('projects').update({ progress: newProgress }).eq('id', projectId);
    };

    recalcProgress();

    // Poll task changes every 15 seconds
    const taskPoll = setInterval(recalcProgress, 15000);

    return () => {
      clearInterval(taskPoll);
    };
  }, [projectId, db]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-app">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  if (!project) return <Navigate to="/hub" replace />;

  return (
    <div
      className="relative flex h-screen overflow-hidden bg-surface-app text-text-primary flex-col"
      style={{
        borderRadius: '22px',
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* ── Inner layout: sidebar + content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Hide sidebar when terminal is maximized and visible */}
        {!(isTerminalMaximized && isTerminalRoute) && (
          <WorkspaceSidebar
            project={project}
            collapsed={collapsed}
            onToggleCollapse={setCollapsed}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0 bg-surface-app relative">
          {shouldShowGlobalHeader && (
            <PageHeader project={project} pageName={PAGE_LABELS[currentPage] || currentPage} />
          )}

          {/* Main Routed Content */}
          <main
            className="flex-1 w-full overflow-y-auto"
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
              <TerminalWorkspacesManager
                cwd={project.local_path}
                isVisible={isTerminalRoute}
                projectId={project.id}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LegacyAgentHubRedirect() {
  const { projectId } = useParams();
  const location = useLocation();

  return <Navigate to={getLegacyWorkspaceRedirectPath(projectId, location.search)} replace />;
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
    if (!import.meta.env.DEV) return;
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
            <Route path="swarm" element={<SwarmControl />} />
            <Route path="telegram" element={<TelegramMonitor />} />
            <Route path="agenthub" element={<LegacyAgentHubRedirect />} />

            {/* Dummy route for terminales to avoid Router 404, actual render is done globally */}
            <Route path="terminales" element={<div />} />
          </Route>
        </Routes>
      </HashRouter>
    </div>
  );
}

export default App;
