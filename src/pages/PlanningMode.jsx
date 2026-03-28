'use client';
import { useState, useEffect, useCallback, useRef } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
  Brain, Upload, FileText, X, CheckCircle2, Loader2, Sparkles,
  AlertCircle, ArrowRight, Zap, ChevronDown, ChevronUp,
  Copy, Check, File, Trash2, Info, MonitorSmartphone, GraduationCap,
  FlaskConical, Shield, BarChart3, Palette
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// ─── Tipos de proyecto ────────────────────────────────────────────────────────
const PROJECT_TYPES = {
  software: {
    label: "Software / App",
    Icon: MonitorSmartphone,
    color: "#58A6FF",
    bg: "#58A6FF",
    description: "Aplicación web, móvil o de escritorio",
    areas: [
      "Setup y entorno de desarrollo",
      "Arquitectura y diseño de base de datos",
      "Backend / API / lógica de negocio",
      "Frontend — cada pantalla como tarea separada",
      "Integraciones externas (auth, pagos, emails...)",
      "Testing (unitario, integración, E2E)",
      "DevOps / CI/CD / Deploy",
      "Seguridad y revisión de vulnerabilidades",
      "Performance y optimización",
      "Documentación técnica y de usuario",
      "Monitoreo y observabilidad",
      "Post-launch y mantenimiento",
    ],
    taskGuidance: "Genera las tareas necesarias para cubrir el proyecto de forma completa. Un MVP simple puede necesitar 20-30 tareas; una plataforma compleja 50-70. Lo importante es que cada área crítica tenga al menos una tarea concreta.",
    tips: "Crea una tarea por cada pantalla/endpoint importante. No agrupes demasiado.",
  },
  university: {
    label: "Universidad / Académico",
    Icon: GraduationCap,
    color: "#D2A8FF",
    bg: "#D2A8FF",
    description: "Trabajo de grado, tesis, informe o presentación",
    areas: [
      "Planificación y cronograma de entrega",
      "Revisión bibliográfica y estado del arte",
      "Marco teórico / conceptual",
      "Metodología y diseño de investigación",
      "Recolección y organización de datos",
      "Análisis y procesamiento",
      "Redacción por capítulos/secciones",
      "Citas, referencias y formato",
      "Revisiones y correcciones",
      "Preparación de presentación o defensa",
      "Entrega y archivo final",
    ],
    taskGuidance: "Para trabajos académicos, entre 15-30 tareas suele ser suficiente. Organiza por etapas del proceso académico y fechas de entrega.",
    tips: "Incluye las fechas límite de cada entrega como due_date en las tareas.",
  },
  research: {
    label: "Investigación / Ciencia",
    Icon: FlaskConical,
    color: "#3FB950",
    bg: "#3FB950",
    description: "Investigación científica, análisis de datos, artículo académico",
    areas: [
      "Definición de hipótesis y objetivos",
      "Revisión de literatura existente",
      "Diseño metodológico",
      "Recolección y limpieza de datos",
      "Análisis estadístico / modelado",
      "Interpretación de resultados",
      "Validación y reproducibilidad",
      "Redacción del artículo/informe",
      "Revisión por pares (interna)",
      "Publicación o presentación",
    ],
    taskGuidance: "Entre 20-40 tareas según el alcance. Divide cada fase de investigación en sub-tareas concretas y verificables.",
    tips: "Incluye tareas de validación para cada resultado crítico.",
  },
  security: {
    label: "Seguridad / Pentesting",
    Icon: Shield,
    color: "#E3B341",
    bg: "#E3B341",
    description: "Auditoría de seguridad, CTF, laboratorio de pentesting",
    areas: [
      "Configuración del entorno y herramientas",
      "Reconocimiento (OSINT, pasivo)",
      "Escaneo activo y enumeración",
      "Análisis de vulnerabilidades",
      "Explotación y prueba de concepto",
      "Post-explotación y pivoting",
      "Escalación de privilegios",
      "Análisis de aplicaciones web",
      "Documentación de hallazgos",
      "Informe técnico final",
      "Remediación y recomendaciones",
    ],
    taskGuidance: "Entre 20-40 tareas. Cada servicio, vector o CVE descubierto puede ser una tarea individual.",
    tips: "Documenta cada hallazgo como tarea con descripción del vector y evidencia.",
  },
  business: {
    label: "Negocio / Emprendimiento",
    Icon: BarChart3,
    color: "#F78166",
    bg: "#F78166",
    description: "Plan de negocio, estrategia, lanzamiento de producto",
    areas: [
      "Investigación de mercado y competencia",
      "Definición de propuesta de valor",
      "Modelo de negocio (Canvas)",
      "Estrategia go-to-market",
      "Plan de marketing y contenidos",
      "Estrategia de ventas y canales",
      "KPIs y métricas de éxito",
      "Plan operaciones",
      "Proyecciones financieras",
      "Lanzamiento y validación",
      "Seguimiento y ajustes",
    ],
    taskGuidance: "Entre 25-45 tareas. Enfócate en acciones concretas con responsable y fecha. Evita tareas demasiado abstractas.",
    tips: "Cada tarea debe tener un entregable claro: documento, decisión, o acción medible.",
  },
  creative: {
    label: "Creativo / Diseño",
    Icon: Palette,
    color: "#FF79C6",
    bg: "#FF79C6",
    description: "Diseño, arte, contenido multimedia, escritura creativa",
    areas: [
      "Concepto y brief creativo",
      "Investigación visual / referentes",
      "Mood board y paleta",
      "Bocetos y wireframes",
      "Sistema de diseño / identidad",
      "Producción de assets principales",
      "Prototipo o borrador",
      "Sesión de feedback y revisiones",
      "Iteración y ajustes finales",
      "Exportación y entrega",
      "Documentación del proceso",
    ],
    taskGuidance: "Entre 15-35 tareas según el alcance. Los proyectos creativos pueden variar mucho; adapta según los ciclos de revisión esperados.",
    tips: "Incluye tareas de 'esperar feedback' como hitos para no bloquear el avance.",
  },
};

// ─── Utils ───────────────────────────────────────────────────────────────────
const ACCEPTED_TYPES = [".txt", ".md", ".json", ".yaml", ".yml", ".csv", ".js", ".ts", ".py", ".jsx", ".tsx", ".html", ".css"];
const MAX_FILE_SIZE_MB = 2;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PlanningMode() {
  const { project } = useOutletContext() || {};
  const navigate = useNavigate();
  const supabase = createClient();
  const dropRef = useRef(null);

  const [user, setUser] = useState(null);
  const [files, setFiles] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [planningPrompt, setPlanningPrompt] = useState(project?.planning_prompt || "");
  const [projectType, setProjectType] = useState(project?.project_type || "software");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contextReady, setContextReady] = useState(
    project?.planning_status === "pending" || project?.planning_status === "completed"
  );
  const [copied, setCopied] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [stats, setStats] = useState({ milestones: 0, tasks: 0 });

  const selectedType = PROJECT_TYPES[projectType] || PROJECT_TYPES.software;

  // Polling de progreso del planning
  useEffect(() => {
    if (!project?.id) return;
    const poll = async () => {
      const [{ count: mCount }, { count: tCount }] = await Promise.all([
        supabase.from("milestones").select("id", { count: "exact", head: true }).eq("project_id", project.id),
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", project.id),
      ]);
      setStats({ milestones: mCount || 0, tasks: tCount || 0 });
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [project?.id]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const fetchFiles = useCallback(async () => {
    if (!project?.id) return;
    const res = await fetch(`/api/projects/${project.id}/files`);
    const data = await res.json();
    setFiles(data.files || []);
  }, [project?.id]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  // Drag & drop
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    processFileList(e.dataTransfer.files);
  };

  function processFileList(fileList) {
    Array.from(fileList).forEach((file) => {
      const ext = "." + file.name.split(".").pop().toLowerCase();
      if (!ACCEPTED_TYPES.includes(ext)) {
        toast.error(`Tipo no soportado: ${file.name}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`Archivo demasiado grande: ${file.name}`, { description: `Máximo ${MAX_FILE_SIZE_MB}MB` });
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPendingFiles((prev) => [
          ...prev,
          { file_name: file.name, content: ev.target.result, file_type: ext.replace(".", ""), size: file.size }
        ]);
      };
      reader.readAsText(file);
    });
  }

  async function handleUpload() {
    if (!pendingFiles.length || !user) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: pendingFiles, user_id: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${data.saved} archivo(s) guardado(s) en el contexto`);
        setPendingFiles([]);
        fetchFiles();
      } else {
        toast.error("Error subiendo archivos: " + data.error);
      }
    } catch (e) {
      toast.error("Error de red: " + e.message);
    }
    setUploading(false);
  }

  async function handleDeleteFile(fileId) {
    const res = await fetch(`/api/projects/${project.id}/files?file_id=${fileId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Archivo eliminado del contexto");
      fetchFiles();
    }
  }

  async function savePrompt() {
    if (!project?.id) return;
    setSaving(true);
    await supabase.from("projects").update({
      planning_prompt: planningPrompt,
      planning_status: "pending",
      project_type: projectType,
    }).eq("id", project.id);
    setSaving(false);
    setContextReady(true);
    toast.success("Contexto guardado — listo para planificar");
  }

  // ── Prompt adaptativo según tipo ─────────────────────────────────────────
  const agentPrompt = `## INSTRUCCIÓN DE PLANIFICACIÓN — ${selectedType.label.toUpperCase()}

**Proyecto:** ${project?.name}
**Tipo:** ${selectedType.label} — ${selectedType.description}
**Descripción:** ${project?.description || "Sin descripción"}
**project_id:** \`${project?.id}\`
**user_id:** \`${user?.id}\`

### Contexto del usuario:
${planningPrompt || "(sin prompt adicional — infiere del tipo de proyecto y los archivos)"}

### Archivos de contexto (${files.length}):
${files.length > 0
  ? files.map(f => `- **${f.file_name}** (${f.file_type}, ${f.size_chars?.toLocaleString() || "?"} chars)`).join("\n")
  : "_(ninguno subido — planifica basándote en el prompt y el tipo de proyecto)_"}

---

### TU TAREA: Generar un plan EXHAUSTIVO y ADAPTADO

Usando los tools MCP \`get_project_context\`, \`create_milestone\` y \`create_task\`:

**Paso 1** — Lee el contexto completo:
\`get_project_context({ project_id: "${project?.id}" })\`

**Paso 2** — Crea entre 4-7 Milestones que cubran todas las fases del proyecto:
${selectedType.areas.slice(0, 4).map((a, i) => `- Ejemplo Fase ${i + 1}: "${a}"`).join("\n")}
- _(adapta y amplía según el contexto específico del proyecto)_

**Paso 3** — Crea las tareas necesarias para cada milestone:

**Áreas clave a cubrir para un proyecto de tipo "${selectedType.label}":**
${selectedType.areas.map((a, i) => `${i + 1}. ${a}`).join("\n")}

**Guía de cantidad:** ${selectedType.taskGuidance}

**Consejo:** ${selectedType.tips}

**Prioridades:**
- \`critical\` → bloqueante o núcleo del proyecto
- \`high\` → features principales o entregas clave
- \`medium\` → importante pero no bloqueante
- \`low\` → nice-to-have, optimizaciones futuras

**Paso 4** — Al finalizar SIEMPRE llama:
\`mark_planning_done({ project_id: "${project?.id}" })\`

> Genera tantas tareas como el proyecto genuinamente necesite para estar bien cubierto. No infles artificialmente pero tampoco omitas áreas críticas. La exhaustividad real importa más que un número específico.`;

  async function copyPrompt() {
    await navigator.clipboard.writeText(agentPrompt);
    setCopied(true);
    toast.success("Prompt copiado — pégalo en el chat con Antigravity");
    setTimeout(() => setCopied(false), 3000);
  }

  const isContextEmpty = !planningPrompt.trim() && files.length === 0 && pendingFiles.length === 0;

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-app/95 backdrop-blur-sm border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${selectedType.color}15`, border: `1px solid ${selectedType.color}30` }}>
            <selectedType.Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: selectedType.color }} />
          </div>
          <div>
            <h1 className="font-mono text-sm font-bold text-text-primary">Planning IA</h1>
            <p className="text-[10px]" style={{ color: selectedType.color }}>{selectedType.label} · {project?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats.tasks > 0 && (
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#3FB950]/10 border border-[#3FB950]/20 text-[#3FB950] flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" />
              {stats.milestones} hitos · {stats.tasks} tareas
            </span>
          )}
          {project?.planning_status === "completed" && (
            <button
              onClick={() => navigate(`/project/${project.id}/dashboard`)}
              className="flex items-center gap-2 bg-[#3FB950] text-white text-xs font-semibold px-4 py-1.5 rounded-lg hover:bg-[#3FB950]/85 transition-all"
            >
              Ver Workspace <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Banner estado */}
        {project?.planning_status === "completed" ? (
          <div className="bg-[#3FB950]/8 border border-[#3FB950]/25 rounded-xl p-5 flex items-center gap-4">
            <CheckCircle2 className="w-8 h-8 text-[#3FB950] flex-shrink-0" />
            <div>
              <p className="font-mono font-semibold text-[#3FB950]">Planning completado ✓</p>
              <p className="text-xs text-text-muted mt-0.5">
                Se generaron {stats.milestones} hitos y {stats.tasks} tareas adaptadas al tipo <strong className="text-white">{selectedType.label}</strong>.
              </p>
            </div>
          </div>
        ) : (
          <div className="border rounded-xl p-5 flex items-start gap-4"
            style={{ background: `${selectedType.color}08`, borderColor: `${selectedType.color}25` }}>
            <Sparkles className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: selectedType.color }} />
            <div>
              <p className="font-mono font-semibold text-sm" style={{ color: selectedType.color }}>
                Modo Planning — {selectedType.label}
              </p>
              <p className="text-xs text-text-muted leading-relaxed mt-1">
                Sube archivos de contexto y describe tu proyecto. Luego copia el prompt y envíalo a <strong className="text-text-primary">Antigravity</strong> — generará un plan adaptado a tu tipo de proyecto.
              </p>
            </div>
          </div>
        )}

        {/* SECCIÓN 0 — Tipo de proyecto */}
        <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-borders-subtle flex items-center gap-2.5">
            <Brain className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
            <h2 className="font-mono text-sm font-semibold text-text-primary">0. Tipo de proyecto</h2>
            <span className="text-[10px] text-text-muted ml-auto">Define cómo se estructurará el plan</span>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {Object.entries(PROJECT_TYPES).map(([key, type]) => {
              const isSelected = projectType === key;
              return (
                <button
                  key={key}
                  onClick={() => setProjectType(key)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all duration-150 ${
                    isSelected ? "shadow-sm" : "hover:bg-surface-elevated border-borders-subtle"
                  }`}
                  style={isSelected ? {
                    background: `${type.color}12`,
                    borderColor: `${type.color}40`,
                  } : {}}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${type.color}${isSelected ? "20" : "10"}`, border: `1px solid ${type.color}30` }}>
                    <type.Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: type.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary leading-tight truncate"
                      style={isSelected ? { color: type.color } : {}}>
                      {type.label}
                    </p>
                    <p className="text-[10px] text-text-muted leading-tight mt-0.5 line-clamp-1">
                      {type.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Áreas del tipo seleccionado */}
          <div className="px-5 pb-4">
            <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider mb-2">
              Áreas que cubrirá el plan — {selectedType.label}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedType.areas.map((area, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full border"
                  style={{ background: `${selectedType.color}08`, borderColor: `${selectedType.color}25`, color: selectedType.color }}>
                  {area}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-text-muted mt-2.5 flex items-start gap-1.5">
              <Info className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: selectedType.color }} />
              {selectedType.taskGuidance}
            </p>
          </div>
        </div>

        {/* SECCIÓN 1 — Prompt */}
        <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-borders-subtle flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-[#E3B341]" strokeWidth={1.5} />
            <h2 className="font-mono text-sm font-semibold text-text-primary">1. Prompt de contexto</h2>
            <span className="text-[10px] text-text-muted ml-auto">Describe tu proyecto con detalle</span>
          </div>
          <div className="px-5 py-4">
            <textarea
              value={planningPrompt}
              onChange={(e) => setPlanningPrompt(e.target.value)}
              rows={7}
              placeholder={
                projectType === "software"
                  ? "¿Qué construirás? Stack tecnológico, features principales, usuarios objetivo, integraciones (pagos, auth...), requerimientos especiales..."
                  : projectType === "university"
                  ? "¿Qué trabajo es? Tema, carrera, fecha de entrega, extensión requerida, formato (APA, normas IEEE...), recursos disponibles..."
                  : projectType === "security"
                  ? "¿Cuál es el alcance? Objetivo del análisis, servicios en scope, herramientas disponibles, entregables esperados..."
                  : projectType === "research"
                  ? "¿Cuál es la pregunta de investigación? Hipótesis, metodología, dataset disponible, forma de publicación esperada..."
                  : projectType === "business"
                  ? "¿Cuál es el negocio? Producto/servicio, mercado objetivo, etapa actual, recursos disponibles, plazos..."
                  : "¿Qué crearás? Estilo, referencias visuales, formato de entrega, cliente, plazos..."
              }
              className="w-full bg-surface-app border border-borders-strong rounded-lg px-4 py-3 text-sm text-white placeholder-[#484F58] focus:outline-none focus:border-[#D2A8FF]/50 focus:ring-1 focus:ring-[#D2A8FF]/10 transition-colors resize-none font-mono leading-relaxed"
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-[10px] text-text-muted">{planningPrompt.length.toLocaleString()} caracteres</span>
              {planningPrompt.length > 0 && planningPrompt.length < 150 && (
                <span className="text-[10px] text-[#E3B341] flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />Más detalle = mejor plan
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SECCIÓN 2 — Archivos */}
        <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-borders-subtle flex items-center gap-2.5">
            <Upload className="w-4 h-4 text-[#58A6FF]" strokeWidth={1.5} />
            <h2 className="font-mono text-sm font-semibold text-text-primary">2. Archivos de contexto <span className="text-[#484F58] font-normal">(opcional)</span></h2>
          </div>
          <div className="px-5 py-4">
            <div
              ref={dropRef}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input-planning").click()}
              className={`relative border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-200 ${
                isDragging
                  ? "border-[#58A6FF] bg-[#58A6FF]/5 scale-[1.01]"
                  : "border-borders-strong hover:border-[#58A6FF]/40 hover:bg-surface-elevated"
              }`}
            >
              <input
                id="file-input-planning"
                type="file"
                multiple
                accept={ACCEPTED_TYPES.join(",")}
                className="hidden"
                onChange={(e) => processFileList(e.target.files)}
              />
              <Upload className={`w-7 h-7 mx-auto mb-2 ${isDragging ? "text-[#58A6FF]" : "text-text-muted"}`} strokeWidth={1} />
              <p className={`text-sm font-medium ${isDragging ? "text-[#58A6FF]" : "text-text-primary"}`}>
                {isDragging ? "Suelta los archivos aquí" : "Arrastra archivos o haz clic para seleccionar"}
              </p>
              <p className="text-[11px] text-text-muted mt-1">
                {projectType === "software"
                  ? "ERDs, specs, READMEs, user stories, configs..."
                  : projectType === "university"
                  ? "Rubrica, enunciado, notas, bibliografía..."
                  : projectType === "security"
                  ? "Targets, reglas de engagement, resultados previos..."
                  : "Cualquier documento de referencia relevante"}
                {" "}· .txt .md .json .py .js .yaml — máx {MAX_FILE_SIZE_MB}MB
              </p>
            </div>

            {pendingFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">En cola ({pendingFiles.length})</p>
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 bg-[#58A6FF]/5 border border-[#58A6FF]/15 rounded-lg px-3 py-2">
                    <FileText className="w-3.5 h-3.5 text-[#58A6FF] flex-shrink-0" strokeWidth={1.5} />
                    <span className="text-xs text-text-primary font-mono flex-1 truncate">{f.file_name}</span>
                    <span className="text-[10px] text-text-muted">{formatBytes(f.size)}</span>
                    <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                      className="text-text-muted hover:text-red-400 transition-colors"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={handleUpload} disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 bg-[#58A6FF] text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-[#58A6FF]/85 transition-all disabled:opacity-50 mt-2">
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? "Guardando..." : `Guardar ${pendingFiles.length} archivo(s)`}
                </button>
              </div>
            )}

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Guardados ({files.length})</p>
                {files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 bg-surface-elevated border border-borders-subtle rounded-lg px-3 py-2 group">
                    <File className="w-3.5 h-3.5 text-[#3FB950] flex-shrink-0" strokeWidth={1.5} />
                    <span className="text-xs text-text-primary font-mono flex-1 truncate">{f.file_name}</span>
                    <span className="text-[10px] text-text-muted">{f.size_chars?.toLocaleString()} chars</span>
                    <button onClick={() => handleDeleteFile(f.id)}
                      className="text-text-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* SECCIÓN 3 — Activar */}
        <div className="bg-surface-card border border-borders-subtle rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-borders-subtle flex items-center gap-2.5">
            <Brain className="w-4 h-4 text-[#D2A8FF]" strokeWidth={1.5} />
            <h2 className="font-mono text-sm font-semibold text-text-primary">3. Activar Planning</h2>
          </div>
          <div className="px-5 py-5 space-y-4">
            <div className="flex items-start gap-3 text-xs text-text-muted leading-relaxed">
              <Info className="w-4 h-4 text-[#D2A8FF] flex-shrink-0 mt-0.5" />
              <p>
                Guarda el contexto, luego copia el <strong className="text-text-primary">Prompt de Agente</strong> y pégalo en el chat con{" "}
                <strong className="text-text-primary">Antigravity</strong>. El agente leerá los archivos y generará un plan
                adaptado a <strong style={{ color: selectedType.color }}>{selectedType.label}</strong>.
              </p>
            </div>

            <button
              onClick={savePrompt}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-3 rounded-xl transition-all disabled:opacity-40"
              style={{ background: `linear-gradient(to right, ${selectedType.color}cc, ${selectedType.color})` }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {saving ? "Guardando..." : "Guardar contexto y generar prompt"}
            </button>

            {contextReady && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-text-muted font-mono uppercase tracking-wider">Prompt de agente — {selectedType.label}</p>
                  <button
                    onClick={() => setShowPromptPreview(!showPromptPreview)}
                    className="text-[10px] text-text-muted hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {showPromptPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showPromptPreview ? "Ocultar" : "Vista previa"}
                  </button>
                </div>

                {showPromptPreview && (
                  <pre className="bg-surface-app border border-borders-subtle rounded-lg p-4 text-[10px] font-mono text-text-muted leading-relaxed overflow-auto max-h-64 whitespace-pre-wrap">
                    {agentPrompt}
                  </pre>
                )}

                <button
                  onClick={copyPrompt}
                  className={`w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl border transition-all ${
                    copied
                      ? "bg-[#3FB950]/15 border-[#3FB950]/30 text-[#3FB950]"
                      : "bg-surface-elevated border-borders-strong text-text-primary hover:border-[#D2A8FF]/40 hover:text-[#D2A8FF]"
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "¡Copiado! Pégalo en el chat" : "Copiar Prompt para Antigravity"}
                </button>

                {stats.tasks > 0 && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="rounded-lg px-4 py-3 text-center border"
                      style={{ background: `${selectedType.color}08`, borderColor: `${selectedType.color}25` }}>
                      <p className="font-mono text-2xl font-bold" style={{ color: selectedType.color }}>{stats.milestones}</p>
                      <p className="text-[10px] text-text-muted">Hitos creados</p>
                    </div>
                    <div className="rounded-lg px-4 py-3 text-center border"
                      style={{ background: `${selectedType.color}08`, borderColor: `${selectedType.color}25` }}>
                      <p className="font-mono text-2xl font-bold" style={{ color: selectedType.color }}>{stats.tasks}</p>
                      <p className="text-[10px] text-text-muted">Tareas generadas</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
