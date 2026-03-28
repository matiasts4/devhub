import { useState, useEffect, useCallback, useRef } from "react";
import { HashRouter, Routes, Route, Navigate, Outlet, useParams, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import "@/App.css";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import ProjectHub from "./pages/ProjectHub";
import ProjectDashboard from "./pages/ProjectDashboard";
import Tareas from "./pages/Tareas";
import CentroIA from "./pages/CentroIA";
import CodeEditor from "./pages/CodeEditor";
import Scaffolding from "./pages/Scaffolding";
import Roadmap from "./pages/Roadmap";
import Historial from "./pages/Historial";
import Conexiones from "./pages/Conexiones";
import Ajustes from "./pages/Ajustes";
import PlanningMode from "./pages/PlanningMode";
import SwarmControl from "./pages/SwarmControl";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { applyThemeToDocument, getStoredTheme } from "@/lib/theme/themes";
import TerminalWorkspacesManager from "./components/TerminalWorkspacesManager";

function WorkspaceLayout() {
  const { projectId } = useParams();
  const location = useLocation();
  const isTerminalRoute = location.pathname.includes('/terminales');

  const [collapsed, setCollapsed] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadProject = useCallback(async () => {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    setProject(data || null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // Refresco en tiempo real cuando el agente IA actualiza planning_status o progress
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`project-${projectId}-layout`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "projects",
        filter: `id=eq.${projectId}`,
      }, (payload) => {
        setProject(payload.new);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  // Auto-calcula progress cuando el agente IA crea/completa tareas
  useEffect(() => {
    if (!projectId) return;
    const recalcProgress = async () => {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("status")
        .eq("project_id", projectId);
      if (!tasks || tasks.length === 0) return;
      const total = tasks.length;
      const done = tasks.filter(t => t.status === "completed").length;
      const newProgress = Math.round((done / total) * 100);
      await supabase.from("projects").update({ progress: newProgress }).eq("id", projectId);
    };
    const taskChannel = supabase
      .channel(`tasks-${projectId}-progress`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "tasks",
        filter: `project_id=eq.${projectId}`,
      }, recalcProgress)
      .subscribe();
    return () => { supabase.removeChannel(taskChannel); };
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-app">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  if (!project) return <Navigate to="/hub" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-surface-app text-text-primary">
      <WorkspaceSidebar
        project={project}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      
      <div className="flex-1 flex flex-col min-w-0 bg-surface-app relative">
        {/* Main Routed Content - Hidden physically when in Terminales route to preserve memory of other views if needed, though usually Outlet swapping unmounts what's inside. We hide it to show terminal. */}
        <main
          className="h-full w-full overflow-y-auto"
          style={{ display: isTerminalRoute ? 'none' : 'block', scrollbarWidth: "thin", scrollbarColor: "var(--border-subtle) transparent" }}
        >
          <Outlet context={{ project }} />
        </main>
        
        {/* Persistent Terminal IDE Container */}
        <div 
           className="absolute inset-0 z-10 bg-[#0d0d0d]" 
           style={{ display: isTerminalRoute ? 'block' : 'none' }}
        >
           {project && <TerminalWorkspacesManager cwd={project.local_path} isVisible={isTerminalRoute} />}
        </div>
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    applyThemeToDocument(getStoredTheme());
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
              background: "var(--surface-card)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-primary)",
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
            <Route path="agentes" element={<CentroIA />} />
            <Route path="editor" element={<CodeEditor />} />
            <Route path="scaffolding" element={<Scaffolding />} />
            <Route path="roadmap" element={<Roadmap />} />
            <Route path="historial" element={<Historial />} />
            <Route path="conexiones" element={<Conexiones />} />
            <Route path="ajustes" element={<Ajustes />} />
            <Route path="planning" element={<PlanningMode />} />
            <Route path="swarm" element={<SwarmControl />} />

            {/* Dummy route for terminales to avoid Router 404, actual render is done globally */}
            <Route path="terminales" element={<div />} />
          </Route>
        </Routes>
      </HashRouter>
    </div>
  );
}

export default App;

