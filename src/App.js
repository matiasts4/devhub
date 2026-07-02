/* eslint-disable no-unused-vars */
import { useState, useEffect, useCallback, useMemo } from 'react';
import useSupabaseRealtime from '@/hooks/useSupabaseRealtime';
import { useRouteDirection } from '@/hooks/useRouteDirection';
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useParams,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { Toaster } from 'sileo';
import { AnimatePresence, motion } from 'framer-motion';
import '@/App.css';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import ProjectHub from './views/ProjectHub';
import ProjectDashboard from './views/ProjectDashboard';
import Tareas from './views/Tareas';
import CodeEditor from './views/CodeEditor';
import Scaffolding from './views/Scaffolding';
import Roadmap from './views/Roadmap';
import Planificacion from './views/Planificacion';
import Historial from './views/Historial';
import Conexiones from './views/Conexiones';
import Ajustes from './views/Ajustes';
import SwarmControl from './views/SwarmControl';
import TelegramMonitor from './views/TelegramMonitor';
import MotionLab from './views/MotionLab';
import { createClient } from '@/lib/db/localClient';
import { Loader2 } from 'lucide-react';
import {
  applyAccentToDocument,
  applyMorphologyToDocument,
  applyThemeToDocument,
  getStoredAccent,
  getStoredMorphology,
  getStoredTheme,
  applyZoomToDocument,
  getStoredZoom,
  setZoom,
  getStoredTerminalHeaderStyle,
  getStoredTerminalAccentBarVisible,
} from '@/lib/theme/themes';
import TerminalWorkspacesManager from './components/TerminalWorkspacesManager';
import { OperatorActionsDispatchProvider } from './lib/operator/OperatorActionsDispatchContext';
import { getUIPrefs, saveUIPref } from '@/lib/uiState';
import PageHeader from './components/PageHeader';
import { getLegacyWorkspaceRedirectPath } from '@/lib/workspaceRouting';
import { isDevelopmentRuntime } from '@/lib/runtime/isDevelopmentRuntime';
import {
  getTerminalPanelBodyStyle,
  getWorkspaceShellChromeStyle,
} from './components/terminal/terminalChromeStyles';
import { resolveWorkspaceShellVisibilityStyle } from './components/terminal/workspaceAnimProps';
import { useAuth } from '@/lib/auth/AuthContext';
import { MotionProvider } from '@/components/ui/motion/MotionProvider';
import { useMotionMode } from '@/components/ui/motion/MotionModeContext';
import { getTransition } from '@/components/ui/system/motion-tokens';

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
  planificacion: 'planificación',
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
  const [isPizarraActive, setIsPizarraActive] = useState(false);
  const [terminalManagerEverMounted, setTerminalManagerEverMounted] = useState(false);
  const [uiPrefsReady, setUiPrefsReady] = useState(false);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const db = useMemo(() => createClient(), []);

  const { activeWorkspaceId } = useAuth();
  const navigate = useNavigate();
  const motionMode = useMotionMode();
  const direction = useRouteDirection();

  const loadProject = useCallback(async () => {
    const { data } = await db.from('projects').select('*').eq('id', projectId).single();
    setProject(data || null);
    setLoading(false);
  }, [projectId, db]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project && activeWorkspaceId && project.workspace_id !== activeWorkspaceId) {
      navigate('/hub');
    }
  }, [project, activeWorkspaceId, navigate]);

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

  // Listen for Pizarra activation events
  useEffect(() => {
    const handlePizarraActive = (e) => {
      setIsPizarraActive(e.detail?.active ?? false);
    };
    window.addEventListener('devhub:pizarra-active', handlePizarraActive);
    return () => window.removeEventListener('devhub:pizarra-active', handlePizarraActive);
  }, []);

  // Sync terminal-view attribute on html for CSS targeting
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isTerminalRoute) {
      document.documentElement.setAttribute('data-terminal-view', 'true');
    } else {
      document.documentElement.removeAttribute('data-terminal-view');
    }
  }, [isTerminalRoute]);

  useEffect(() => {
    if (isTerminalRoute) setTerminalManagerEverMounted(true);
  }, [isTerminalRoute]);

  const terminalContainerStyle = useMemo(() => {
    const base = getTerminalPanelBodyStyle();
    if (!terminalManagerEverMounted) {
      return { ...base, display: isTerminalRoute ? 'block' : 'none' };
    }
    return {
      ...base,
      display: 'block',
      ...resolveWorkspaceShellVisibilityStyle({
        isActiveWorkspace: true,
        isManagerVisible: isTerminalRoute,
      }),
    };
  }, [isTerminalRoute, terminalManagerEverMounted]);

  // Apply terminal zone appearance (header style + accent bar) on mount.
  // Uses 'dragon' as default if no stored preference exists.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const headerStyle = getStoredTerminalHeaderStyle();
    const accentBarVisible = getStoredTerminalAccentBarVisible();
    const container = document.querySelector('[data-terminal-container]');
    if (!container) return;
    container.setAttribute('data-terminal-header-style', headerStyle);
    container.setAttribute('data-terminal-accent-bar', String(accentBarVisible));
  }, []);

  useEffect(() => {
    if (!projectId || !uiPrefsReady) return;
    saveUIPref(projectId, 'sidebarCollapsed', collapsed);
  }, [projectId, collapsed, uiPrefsReady]);

  // Realtime project updates
  useSupabaseRealtime({
    table: 'projects',
    filter: projectId ? `id=eq.${projectId}` : undefined,
    onUpdate: loadProject,
    onDelete: () => navigate('/hub'),
    enabled: Boolean(projectId),
    channelName: `public:projects:${projectId || 'none'}`,
  });

  // Auto-calcula progress cuando cambian las tareas (agente IA o colaboradores)
  const recalcProgress = useCallback(async () => {
    if (!projectId) return;
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
  }, [projectId, db]);

  useEffect(() => {
    if (!projectId) return;
    recalcProgress();
  }, [projectId, recalcProgress]);

  useSupabaseRealtime({
    table: 'tasks',
    filter: projectId ? `project_id=eq.${projectId}` : undefined,
    onInsert: recalcProgress,
    onUpdate: recalcProgress,
    onDelete: recalcProgress,
    enabled: Boolean(projectId),
    channelName: `public:tasks-progress:${projectId || 'none'}`,
  });

  const sidebarWidth = collapsed ? 48 : 256;
  const sidebarOffset = motionMode === 'reduced' ? 0 : -sidebarWidth;
  const sidebarTransition = getTransition('nav', motionMode);

  const routeTransition = getTransition('nav', motionMode);
  const routeScale = motionMode === 'reduced' ? 1 : motionMode === 'amplified' ? 0.95 : 0.98;
  const routeVariants = {
    enter: {
      scale: routeScale,
      opacity: 0,
    },
    center: { scale: 1, opacity: 1 },
    exit: {
      scale: direction === 'forward' ? 1.01 : 0.99,
      opacity: 0,
    },
  };

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
        ...(isTerminalRoute
          ? { borderWidth: 0, boxShadow: 'none' }
          : getWorkspaceShellChromeStyle()),
        borderRadius: '22px',
      }}
    >
      {/* ── Inner layout: sidebar + content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AnimatePresence initial={false}>
          {!((isTerminalMaximized || isPizarraActive) && isTerminalRoute) && (
            <div
              key="workspace-sidebar-wrapper"
              style={{ width: sidebarWidth, overflow: 'hidden', display: 'flex', flexShrink: 0 }}
            >
              <motion.div
                initial={{ x: sidebarOffset, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: sidebarOffset, opacity: 0 }}
                transition={sidebarTransition}
                style={{ width: sidebarWidth, flexShrink: 0 }}
              >
                <WorkspaceSidebar
                  project={project}
                  collapsed={collapsed}
                  onToggleCollapse={setCollapsed}
                />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col min-w-0 bg-surface-app relative">
          {shouldShowGlobalHeader && (
            <PageHeader project={project} pageName={PAGE_LABELS[currentPage] || currentPage} />
          )}

          {/* Main Routed Content */}
          <main
            className={`flex-1 w-full min-h-0 overflow-y-auto ${isTerminalRoute ? 'hidden' : ''}`}
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--border-subtle) transparent',
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                variants={routeVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={routeTransition}
                style={{ width: '100%' }}
              >
                <Outlet context={{ project }} />
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Persistent Terminal IDE Container */}
          <div
            className="absolute inset-0 z-10 bg-[#0d0d0d]"
            data-terminal-container
            data-terminal-view={isTerminalRoute ? 'true' : undefined}
            aria-hidden={terminalManagerEverMounted && !isTerminalRoute ? 'true' : undefined}
            style={terminalContainerStyle}
          >
            {/* Drag region for the Tauri window is provided by the
                WorkspaceWindowTabBar wrapper (data-tauri-drag-region on the tab bar
                inside the terminal container). No extra header is needed here. */}
            {project && (isTerminalRoute || terminalManagerEverMounted) ? (
              <OperatorActionsDispatchProvider>
                <TerminalWorkspacesManager
                  cwd={project.local_path}
                  isVisible={isTerminalRoute}
                  projectId={project.id}
                />
              </OperatorActionsDispatchProvider>
            ) : null}
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
    applyMorphologyToDocument(getStoredMorphology());
    applyAccentToDocument(getStoredAccent());
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

  // Block the browser's native ctrl/⌘ + wheel (and trackpad pinch, which the
  // engine reports as a wheel event with ctrlKey set) page zoom. Without this,
  // pinching/ctrl-scrolling inside the app — e.g. while zooming the pizarra
  // canvas — zooms the ENTIRE webview (top workspace tabs, HUD, bottom bars all
  // scale/disappear) instead of only the intended target. The app exposes its
  // own document zoom via the keyboard handler above; the pizarra canvas does
  // its own focal zoom in JS. We only need to stop the engine's default zoom.
  // Capture phase + { passive: false } so preventDefault is honored even when an
  // inner handler stops propagation.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const preventBrowserZoom = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', preventBrowserZoom, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', preventBrowserZoom, { capture: true });
  }, []);

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
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
      <MotionProvider>
        <HashRouter>
          <Toaster
            position="bottom-right"
            offset={20}
            options={{
              fill: '#0d1117',
              duration: 6000,
              styles: {
                title: 'text-white!',
                description: 'text-white/70!',
                badge: 'bg-white/10!',
                button: 'bg-white/10! text-white!',
              },
            }}
          />
          <Routes>
            <Route path="/" element={<Navigate to="/hub" replace />} />
            <Route path="/hub" element={<ProjectHub />} />
            <Route path="/project/:projectId" element={<WorkspaceLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<ProjectDashboard />} />
              <Route path="planificacion" element={<Planificacion />} />
              <Route path="tareas" element={<Tareas />} />
              <Route path="editor" element={<CodeEditor />} />
              <Route path="scaffolding" element={<Scaffolding />} />
              <Route path="roadmap" element={<Roadmap />} />
              <Route path="historial" element={<Historial />} />
              <Route path="conexiones" element={<Conexiones />} />
              <Route path="ajustes" element={<Ajustes />} />
              <Route path="swarm" element={<SwarmControl />} />
              <Route path="telegram" element={<TelegramMonitor />} />
              <Route path="motion-lab" element={<MotionLab />} />
              <Route path="agenthub" element={<LegacyAgentHubRedirect />} />

              {/* Dummy route for terminales to avoid Router 404, actual render is done globally */}
              <Route path="terminales" element={<div />} />
            </Route>
          </Routes>
        </HashRouter>
      </MotionProvider>
    </div>
  );
}

export default App;
