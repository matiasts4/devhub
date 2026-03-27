import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Proyectos from "./pages/Proyectos";
import Scaffolding from "./pages/Scaffolding";
import Roadmap from "./pages/Roadmap";
import CentroIA from "./pages/CentroIA";
import Conexiones from "./pages/Conexiones";
import Ajustes from "./pages/Ajustes";

function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="App">
      <BrowserRouter>
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          toastOptions={{
            style: { background: '#111827', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' },
          }}
        />
        <div className="flex h-screen bg-[#0B0F19] overflow-hidden">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <main
            data-testid="main-content"
            className="flex-1 overflow-y-auto"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#1e2a3a transparent" }}
          >
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/proyectos" element={<Proyectos />} />
              <Route path="/scaffolding" element={<Scaffolding />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/centro-ia" element={<CentroIA />} />
              <Route path="/conexiones" element={<Conexiones />} />
              <Route path="/ajustes" element={<Ajustes />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </div>
  );
}

export default App;
