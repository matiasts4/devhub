/* eslint-disable no-unused-vars */
import { useState, useEffect, useCallback, useMemo } from 'react';
import useSupabaseRealtime from '@/hooks/useSupabaseRealtime';
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
import {
  isTerminalesSidebarToggleShortcut,
  resolveWorkspaceSidebarWidth,
} from './components/workspaceSidebarUtils';
import ProjectHub from './views/ProjectHub';
import ProjectDashboard from './views/ProjectDashboard';
import Tareas from './views/Tareas';
import CodeEditor from './views/CodeEditor';
import Scaffolding from './views/Scaffolding';
import Roadmap from './views/Roadmap';
import Planificacion from './views/Planificacion';
import Historial from './views/Historial';
import Ajustes from './views/Ajustes';
import SwarmControl from './views/SwarmControl';
import MotionLab from './views/MotionLab';
import NotificationToastStack from './components/NotificationToastStack';
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
import dynamic from 'next/dynamic';
import { OperatorActionsDispatchProvider } from './lib/operator/OperatorActionsDispatchContext';
import { getUIPrefs, saveUIPref } from '@/lib/uiState';
import PageHeader from './components/PageHeader';
import {
  getLegacyWorkspaceRedirectPath,
  normalizeProjectPageKey,
  resolveProjectEntryPage,
} from '@/lib/workspaceRouting';
import { isDevelopmentRuntime } from '@/lib/runtime/isDevelopmentRuntime';
import {
  getTerminalPanelBodyStyle,
  getWorkspaceShellChromeStyle,
} from './components/terminal/terminalChromeStyles';
import { resolveWorkspaceShellVisibilityStyle } from './components/terminal/workspaceAnimProps';
import { useAuth } from '@/lib/auth/AuthContext';
import { MotionProvider } from '@/components/ui/motion/MotionProvider';
import { useMotionMode } from '@/components/ui/motion/MotionModeContext';
import { getTransition, TRANSITION } from '@/components/ui/system/motion-tokens';
import {
  preloadActiveSceneryPrefs,
  warmAllBundledWallpapers,
} from '@/lib/sceneries/sceneryPreferences';
import {
  exposePerfSnapshotOnWindow,
  markAppShellStart,
  markProjectReady,
  markTerminalRouteEnter,
} from '@/lib/terminal/startupPerfMarks';
import { prefetchTerminalState } from '@/lib/terminal/terminalStatePrefetch';
import {
  prefetchXtermRendererModules,
  scheduleTerminalWarm,
  warmTtySidecarViaApi,
} from '@/lib/terminal/terminalWarmPolicy';

// TerminalWorkspacesManager (with its whole xterm/hooks graph) loads
// dynamically so the app shell's first compile/paint does not include the
// terminal module graph — on cold Turbopack boots that graph compiles on
// demand (terminal route mount / Tier3 soft-mount) instead of blocking the
// shell. Warm behavior is unchanged: the Tier3 soft-mount still mounts it
// off-route, which now also pre-compiles the chunk.
const TerminalWorkspacesManager = dynamic(() => import('./components/TerminalWorkspacesManager'), {
  ssr: false,
});

// Quick Actions palette (Ctrl+Shift+P) — app-level overlay, works in both
// normal and pizarra modes. Uses cmdk + window listeners, so no SSR.
const QuickActionsPalette = dynamic(() => import('./components/quickActions/QuickActionsPalette'), {
  ssr: false,
});

const PAGE_LABELS = {
  dashboard: 'dashboard',
  tareas: 'tareas',
  editor: 'editor',
  scaffolding: 'scaffolding',
  roadmap: 'roadmap',
  historial: 'historial',
  ajustes: 'ajustes',
  swarm: 'swarm control',
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
  /** On Terminales, sidebar is 0px unless the user peeks it (Ctrl/Cmd+B). */
  const [terminalesSidebarPeek, setTerminalesSidebarPeek] = useState(false);
  const [isTerminalMaximized, setIsTerminalMaximized] = useState(false);
  const [isPizarraActive, setIsPizarraActive] = useState(false);
  const [terminalManagerEverMounted, setTerminalManagerEverMounted] = useState(false);
  const [uiPrefsReady, setUiPrefsReady] = useState(false);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const cachedProjectCwd = useMemo(() => {
    if (!projectId) return null;
    try {
      const cwd = getUIPrefs(projectId).lastProjectCwd;
      return typeof cwd === 'string' && cwd.trim() ? cwd.trim() : null;
    } catch {
      return null;
    }
  }, [projectId]);
  const effectiveTerminalCwd = project?.local_path || cachedProjectCwd || null;
  const db = useMemo(() => createClient(), []);

  const { activeWorkspaceId } = useAuth();
  const navigate = useNavigate();
  const motionMode = useMotionMode();

  const loadProject = useCallback(async () => {
    const { data } = await db.from('projects').select('*').eq('id', projectId).single();
    setProject(data || null);
    setLoading(false);
  }, [projectId, db]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  useEffect(() => {
    markAppShellStart();
    exposePerfSnapshotOnWindow();
    // Start @xterm + session-route compile ASAP (overlaps project fetch).
    void prefetchXtermRendererModules().catch(() => {});
    void warmTtySidecarViaApi({ timeoutMs: 15000 }).catch(() => {});
  }, []);

  // As soon as we know projectId (URL), warm endpoint + hydrate state — don't wait for DB row.
  // Soft-mount TWM only when already on Terminales (cold enter). Off-route warm is idle Tier3.
  useEffect(() => {
    if (!projectId) return undefined;
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    prefetchTerminalState(projectId, storage);
    void warmTtySidecarViaApi({
      cwd: effectiveTerminalCwd || undefined,
      timeoutMs: 15000,
    }).catch(() => {});
    if (isTerminalRoute) {
      setTerminalManagerEverMounted(true);
    }
    return undefined;
  }, [projectId, effectiveTerminalCwd, isTerminalRoute]);

  useEffect(() => {
    if (project) markProjectReady();
  }, [project]);

  useEffect(() => {
    if (project?.id && project?.local_path) {
      saveUIPref(project.id, 'lastProjectCwd', project.local_path);
    }
  }, [project?.id, project?.local_path]);

  useEffect(() => {
    if (!project?.id) return undefined;
    const storage = typeof window !== 'undefined' ? window.localStorage : null;
    const { cancel } = scheduleTerminalWarm({
      projectId: project.id,
      cwd: project.local_path,
      warmSidecar: () => warmTtySidecarViaApi({ cwd: project.local_path }),
      prefetchXtermModules: prefetchXtermRendererModules,
      prefetchState: () => {
        prefetchTerminalState(project.id, storage);
      },
      softMountTerminalManager: () => {
        setTerminalManagerEverMounted(true);
      },
    });
    return cancel;
  }, [project?.id, project?.local_path]);

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
    if (isTerminalRoute) {
      markTerminalRouteEnter();
      setTerminalManagerEverMounted(true);
    } else {
      setTerminalesSidebarPeek(false);
    }
  }, [isTerminalRoute]);

  // Ctrl/Cmd+B toggles project nav peek on Terminales (does not steal plain 'b' from PTY).
  useEffect(() => {
    if (!isTerminalRoute) return undefined;
    const onKeyDown = (event) => {
      if (!isTerminalesSidebarToggleShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setTerminalesSidebarPeek((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
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

  // Remember last section so hub / index reopen skips the dashboard detour (~1s).
  useEffect(() => {
    if (!projectId || !uiPrefsReady) return;
    const page = normalizeProjectPageKey(currentPage);
    if (!page) return;
    saveUIPref(projectId, 'lastProjectPage', page);
  }, [projectId, currentPage, uiPrefsReady]);

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
      ['completed', 'done', 'qa_ready', 'qa-ready', 'resolved', 'closed'].includes(
        (t.status || '').toLowerCase()
      )
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

  const forceHideSidebar = (isTerminalMaximized || isPizarraActive) && isTerminalRoute;
  const sidebarWidth = resolveWorkspaceSidebarWidth({
    isTerminalRoute,
    terminalesSidebarPeek,
    collapsed,
    forceHidden: forceHideSidebar,
  });
  const showWorkspaceSidebar = sidebarWidth > 0;
  const sidebarOffset = motionMode === 'reduced' ? 0 : -Math.max(sidebarWidth, 48);
  const sidebarTransition = getTransition('nav', motionMode);

  // Soft page enter: fade + slight y (no wait/scale). Premium ease via TRANSITION.enter.
  const routeTransition = motionMode === 'reduced' ? TRANSITION.reduced : TRANSITION.enter;
  const routeVariants =
    motionMode === 'reduced'
      ? {
          enter: { opacity: 0 },
          center: { opacity: 1 },
          exit: { opacity: 0 },
        }
      : {
          enter: { opacity: 0, y: 10 },
          center: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: -6 },
        };

  // Non-terminal routes keep the full-page spinner. Terminales paints immediately
  // (cached cwd) so route→panel does not wait on the projects row.
  if (loading && !isTerminalRoute) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-app">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  if (!loading && !project) return <Navigate to="/hub" replace />;

  const sidebarProject = project || { id: projectId, name: '…', local_path: effectiveTerminalCwd };
  const canMountTerminalManager =
    Boolean(projectId && effectiveTerminalCwd) && (isTerminalRoute || terminalManagerEverMounted);

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
      {/* Quick Actions palette (Ctrl+Shift+P) — portaled modal, works in both
          normal and pizarra modes within the project workspace. */}
      <QuickActionsPalette cwd={effectiveTerminalCwd} />

      {/* ── Inner layout: sidebar + content ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {isTerminalRoute ? (
          // Terminales peek must be instant — no slide/fade (feels laggy vs toggle).
          showWorkspaceSidebar ? (
            <div
              key="workspace-sidebar-wrapper"
              data-testid="workspace-sidebar-shell"
              data-sidebar-width={String(sidebarWidth)}
              style={{ width: sidebarWidth, overflow: 'hidden', display: 'flex', flexShrink: 0 }}
            >
              <div style={{ width: sidebarWidth, flexShrink: 0 }}>
                <WorkspaceSidebar
                  project={sidebarProject}
                  collapsed={collapsed}
                  onToggleCollapse={setCollapsed}
                  instantLayout
                />
              </div>
            </div>
          ) : null
        ) : (
          <AnimatePresence initial={false}>
            {showWorkspaceSidebar ? (
              <div
                key="workspace-sidebar-wrapper"
                data-testid="workspace-sidebar-shell"
                data-sidebar-width={String(sidebarWidth)}
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
                    project={sidebarProject}
                    collapsed={collapsed}
                    onToggleCollapse={setCollapsed}
                  />
                </motion.div>
              </div>
            ) : null}
          </AnimatePresence>
        )}

        <div className="flex-1 flex flex-col min-w-0 bg-surface-app relative">
          {shouldShowGlobalHeader && project && (
            <PageHeader project={project} pageName={PAGE_LABELS[currentPage] || currentPage} />
          )}

          {/* Main Routed Content */}
          <main
            className={`flex min-h-0 w-full flex-1 flex-col ${isTerminalRoute ? 'hidden' : 'overflow-hidden'}`}
            data-testid="project-main-scroll"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--border-subtle) transparent',
            }}
          >
            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
              </div>
            ) : (
              <AnimatePresence initial={false}>
                <motion.div
                  key={location.pathname}
                  variants={routeVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={routeTransition}
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
                  style={{ width: '100%' }}
                  data-testid="project-route-scroll"
                >
                  <Outlet context={{ project }} />
                </motion.div>
              </AnimatePresence>
            )}
          </main>

          {/* Persistent Terminal IDE Container */}
          <div
            className="absolute inset-0 z-10 bg-[#0d0d0d]"
            data-terminal-container
            data-terminal-view={isTerminalRoute ? 'true' : undefined}
            aria-hidden={terminalManagerEverMounted && !isTerminalRoute ? 'true' : undefined}
            // inert blocks focus + pointer/wheel on the whole subtree while warm-mounted
            // off-route — CSS pointer-events:none alone is not enough when children set auto.
            inert={terminalManagerEverMounted && !isTerminalRoute ? true : undefined}
            style={terminalContainerStyle}
          >
            {/* Drag region for the Tauri window is provided by the
                WorkspaceWindowTabBar wrapper (data-tauri-drag-region on the tab bar
                inside the terminal container). No extra header is needed here. */}
            {canMountTerminalManager ? (
              <OperatorActionsDispatchProvider>
                <TerminalWorkspacesManager
                  cwd={effectiveTerminalCwd}
                  isVisible={isTerminalRoute}
                  projectId={projectId}
                  navSidebarOpen={showWorkspaceSidebar}
                  onToggleNavSidebar={() => {
                    if (forceHideSidebar) return;
                    setTerminalesSidebarPeek((prev) => !prev);
                  }}
                />
              </OperatorActionsDispatchProvider>
            ) : isTerminalRoute ? (
              <div
                className="flex h-full w-full items-center justify-center"
                data-testid="terminal-awaiting-project"
              >
                <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectEntryRedirect() {
  const { projectId } = useParams();
  const page = resolveProjectEntryPage(projectId);
  return <Navigate to={page} replace />;
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

  // Block the browser's native ctrl/⌘ + wheel page zoom. Without this,
  // ctrl-scrolling inside the app zooms the ENTIRE webview (top workspace tabs,
  // HUD, bottom bars all scale/disappear). The app exposes its own document zoom
  // via the keyboard handler above; the pizarra canvas does its own focal zoom
  // in JS (its own non-passive listener covers trackpad pinch over the canvas).
  //
  // PERF: the non-passive listener is only installed while a modifier key is
  // physically held. A permanent non-passive wheel listener on window forces
  // EVERY wheel event through the main thread — when the main thread is busy
  // (xterm output parsing, React reconciliation) scrolling feels 250 ms+ of
  // input latency. With the dynamic approach, normal scrolling stays fully
  // compositor-driven (zero main-thread dependency). Trade-off: trackpad pinch
  // on plain UI areas (synthetic ctrl+wheel without keydown on Windows) is not
  // blocked — recoverable with ctrl+0; the pizarra/terminal surfaces keep their
  // own always-on non-passive listeners and remain protected.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const preventBrowserZoom = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };

    let installed = false;
    const install = () => {
      if (installed) return;
      document.addEventListener('wheel', preventBrowserZoom, { passive: false, capture: true });
      installed = true;
    };
    const uninstall = () => {
      if (!installed) return;
      document.removeEventListener('wheel', preventBrowserZoom, { capture: true });
      installed = false;
    };

    // keydown/keyup track physical modifier state; mousedown covers the case
    // where the modifier was already held before the window gained focus.
    const syncFromEvent = (e) => {
      if (e.ctrlKey || e.metaKey) install();
      else uninstall();
    };

    window.addEventListener('keydown', syncFromEvent, true);
    window.addEventListener('keyup', syncFromEvent, true);
    window.addEventListener('mousedown', syncFromEvent, true);
    window.addEventListener('blur', uninstall);

    return () => {
      uninstall();
      window.removeEventListener('keydown', syncFromEvent, true);
      window.removeEventListener('keyup', syncFromEvent, true);
      window.removeEventListener('mousedown', syncFromEvent, true);
      window.removeEventListener('blur', uninstall);
    };
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
          <NotificationToastStack />
          <Routes>
            <Route path="/" element={<Navigate to="/hub" replace />} />
            <Route path="/hub" element={<ProjectHub />} />
            <Route path="/project/:projectId" element={<WorkspaceLayout />}>
              <Route index element={<ProjectEntryRedirect />} />
              <Route path="dashboard" element={<ProjectDashboard />} />
              <Route path="planificacion" element={<Planificacion />} />
              <Route path="tareas" element={<Tareas />} />
              <Route path="editor" element={<CodeEditor />} />
              <Route path="scaffolding" element={<Scaffolding />} />
              <Route path="roadmap" element={<Roadmap />} />
              <Route path="historial" element={<Historial />} />
              <Route path="ajustes" element={<Ajustes />} />
              <Route path="swarm" element={<SwarmControl />} />
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
