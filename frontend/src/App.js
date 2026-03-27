import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useParams } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import ProjectHub from "./pages/ProjectHub";
import ProjectDashboard from "./pages/ProjectDashboard";
import Tareas from "./pages/Tareas";
import CentroIA from "./pages/CentroIA";
import Scaffolding from "./pages/Scaffolding";
import Roadmap from "./pages/Roadmap";
import Conexiones from "./pages/Conexiones";
import Ajustes from "./pages/Ajustes";
import { mockProjects } from "./data/projects";

function WorkspaceLayout() {
  const { projectId } = useParams();
  const [collapsed, setCollapsed] = useState(false);
  const project = mockProjects.find((p) => p.id === projectId);

  if (!project) return <Navigate to="/hub" replace />;

  return (
    <div className="flex h-screen bg-[#0D1117] overflow-hidden">
      <WorkspaceSidebar
        project={project}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
      />
      <main
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#21262D transparent" }}
      >
        <Outlet context={{ project }} />
      </main>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          toastOptions={{
            style: { background: "#161B26", border: "1px solid rgba(48,54,61,0.9)", color: "#F0F6FC" },
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
            <Route path="scaffolding" element={<Scaffolding />} />
            <Route path="roadmap" element={<Roadmap />} />
            <Route path="conexiones" element={<Conexiones />} />
            <Route path="ajustes" element={<Ajustes />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
