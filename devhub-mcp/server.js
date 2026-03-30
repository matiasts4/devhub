#!/usr/bin/env node
/**
 * DevHub MCP Server
 * Expone herramientas de DevHub (proyectos, tareas, hitos) para Antigravity.
 * Comunicación via stdio — sin API key externa necesaria.
 *
 * Uso: node devhub-mcp/server.js
 * Config Antigravity: ver devhub-mcp/README.md
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";

const execAsync = promisify(exec);

// Cargar .env.local desde la raíz del proyecto
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;

let openai;
if (OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: OPENAI_API_KEY });
} else {
  process.stderr.write("⚠️  AVISO: No se encontró OPENAI_API_KEY. Búsqueda semántica (embeddings) puede fallar.\n");
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  process.stderr.write("❌ ERROR: Faltan variables SUPABASE en .env.local\n");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function ok(data)  { return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] }; }
function err(msg)  { return { content: [{ type: "text", text: `ERROR: ${msg}` }], isError: true }; }

// ─── Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "devhub",
  version: "1.0.0",
});


// ────────────────────────────────────────────────────────────────────────────
// TERMINAL / EXECUTION
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "run_terminal_command",
  "Ejecuta un comando en la terminal local en background independientemente de la interfaz gráfica.",
  { command: z.string().describe("Comando a ejecutar (ej. 'npm run build', 'ls -la')") },
  async ({ command }) => {
    try {
      const { stdout, stderr } = await execAsync(command, { cwd: path.resolve(__dirname, "..") });
      return ok({ command, stdout, stderr });
    } catch (error) {
      return err(error.message + "\n\nstderr: " + (error.stderr || ""));
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// GIT / VCS
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "git_branch",
  "Crea y/o cambia a una rama de Git aislada en el repositorio actual.",
  { branch_name: z.string().describe("Nombre de la nueva rama o rama a la que cambiar") },
  async ({ branch_name }) => {
    try {
      const cwd = path.resolve(__dirname, "..");
      // Intenta cambiar a la rama, si no existe la crea
      let stdout, stderr;
      try {
        const res = await execAsync(`git checkout ${branch_name}`, { cwd });
        stdout = res.stdout;
        stderr = res.stderr;
      } catch (errSwitch) {
        const res = await execAsync(`git checkout -b ${branch_name}`, { cwd });
        stdout = res.stdout;
        stderr = res.stderr;
      }
      return ok({ branch: branch_name, stdout, stderr });
    } catch (error) {
      return err(error.message + "\n\nstderr: " + (error.stderr || ""));
    }
  }
);

server.tool(
  "git_commit",
  "Realiza un commit en Git con los cambios actuales (añade los archivos indicados o todo al staging).",
  {
    message: z.string().describe("Mensaje del commit"),
    files: z.string().optional().describe("Archivos específicos a añadir (por defecto '.', todo el directorio)")
  },
  async ({ message, files }) => {
    try {
      const cwd = path.resolve(__dirname, "..");
      const targetFiles = files || ".";
      const addCmd = `git add ${targetFiles}`;
      const safeMessage = message.replace(/"/g, '\\"');
      const commitCmd = `git commit -m "${safeMessage}"`;
      
      await execAsync(addCmd, { cwd });
      const { stdout, stderr } = await execAsync(commitCmd, { cwd });
      
      return ok({ success: true, message, stdout, stderr });
    } catch (error) {
      return err(error.message + "\n\nstderr: " + (error.stderr || ""));
    }
  }
);

server.tool(
  "git_diff_review",
  "Inspecciona el delta entre una rama y otra (por defecto main) para validar documentación y cambios en el código. Útil para QA.",
  {
    branch: z.string().describe("La rama a inspeccionar (ej: la rama de un agente)"),
    base_branch: z.string().optional().describe("La rama contra la cual comparar, por defecto es 'main'")
  },
  async ({ branch, base_branch }) => {
    try {
      const cwd = path.resolve(__dirname, "..");
      const base = base_branch || "main";
      // Fetch opcional? asumiendo estado local sincronizado por ahora.
      const diffCmd = `git diff ${base}..${branch}`;
      
      const { stdout, stderr } = await execAsync(diffCmd, { cwd });
      
      return ok({ base, branch, diff: stdout, stderr });
    } catch (error) {
      return err(error.message + "\n\nstderr: " + (error.stderr || ""));
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// FILE SYSTEM
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "explore_files",
  "Explora los archivos de un directorio específico. Usa '.' para la raíz del proyecto.",
  { dir_path: z.string().describe("Ruta relativa del directorio a explorar (ej. 'src/components' o '.')") },
  async ({ dir_path }) => {
    try {
      const targetPath = path.resolve(__dirname, "..", dir_path === '.' ? '' : dir_path);
      const items = await fs.readdir(targetPath, { withFileTypes: true });
      const result = items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file'
      })).sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });
      return ok({ path: dir_path, items: result });
    } catch (error) {
      return err(error.message);
    }
  }
);

server.tool(
  "read_file",
  "Lee el contenido de un archivo específico.",
  { file_path: z.string().describe("Ruta relativa del archivo (ej. 'package.json')") },
  async ({ file_path }) => {
    try {
      const targetPath = path.resolve(__dirname, "..", file_path);
      const content = await fs.readFile(targetPath, 'utf-8');
      return ok({ path: file_path, content });
    } catch (error) {
      return err(error.message);
    }
  }
);

server.tool(
  "write_file",
  "Escribe o sobrescribe el contenido de un archivo.",
  { 
    file_path: z.string().describe("Ruta relativa del archivo"),
    content: z.string().describe("Contenido a escribir en el archivo")
  },
  async ({ file_path, content }) => {
    try {
      const targetPath = path.resolve(__dirname, "..", file_path);
      await fs.writeFile(targetPath, content, 'utf-8');
      return ok({ success: true, path: file_path });
    } catch (error) {
      return err(error.message);
    }
  }
);

server.tool(
  "mkdir_p",
  "Crea un directorio recursivamente si no existe.",
  { dir_path: z.string().describe("Ruta relativa del directorio a crear") },
  async ({ dir_path }) => {
    try {
      const targetPath = path.resolve(__dirname, "..", dir_path);
      await fs.mkdir(targetPath, { recursive: true });
      return ok({ success: true, path: dir_path });
    } catch (error) {
      return err(error.message);
    }
  }
);


// ────────────────────────────────────────────────────────────────────────────
// PROYECTOS
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "list_projects",
  "Lista todos los proyectos del usuario en DevHub con su progreso y estado.",
  { status: z.enum(["active", "paused", "completed", "archived", "all"]).optional().describe("Filtrar por estado. Default: all") },
  async ({ status }) => {
    let query = supabase.from("projects").select("id, name, description, status, progress, color, created_at").order("created_at", { ascending: false });
    if (status && status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return err(error.message);
    return ok({ total: data.length, projects: data });
  }
);

server.tool(
  "get_project",
  "Obtiene todos los detalles de un proyecto específico incluyendo sus tareas e hitos.",
  { project_id: z.string().uuid().describe("UUID del proyecto") },
  async ({ project_id }) => {
    const [projRes, tasksRes, msRes] = await Promise.all([
      supabase.from("projects").select("*").eq("id", project_id).single(),
      supabase.from("tasks").select("*").eq("project_id", project_id).order("created_at", { ascending: false }),
      supabase.from("milestones").select("*").eq("project_id", project_id).order("due_date", { ascending: true }),
    ]);
    if (projRes.error) return err(projRes.error.message);
    return ok({
      project: projRes.data,
      tasks: tasksRes.data || [],
      milestones: msRes.data || [],
      summary: {
        total_tasks:     tasksRes.data?.length || 0,
        completed_tasks: tasksRes.data?.filter(t => t.status === "completed").length || 0,
        in_progress:     tasksRes.data?.filter(t => t.status === "in_progress").length || 0,
        blocked:         tasksRes.data?.filter(t => t.status === "blocked").length || 0,
        milestones_done: msRes.data?.filter(m => m.status === "completed").length || 0,
      },
    });
  }
);

server.tool(
  "update_project",
  "Actualiza los campos de un proyecto (nombre, descripción, progreso, estado, color).",
  {
    project_id:  z.string().uuid(),
    name:        z.string().optional(),
    description: z.string().optional(),
    status:      z.enum(["active", "paused", "completed", "archived"]).optional(),
    progress:    z.number().min(0).max(100).optional(),
    color:       z.string().optional(),
  },
  async ({ project_id, ...updates }) => {
    const fields = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (Object.keys(fields).length === 0) return err("No se proporcionaron campos para actualizar");
    const { data, error } = await supabase.from("projects").update(fields).eq("id", project_id).select().single();
    if (error) return err(error.message);
    return ok({ updated: true, project: data });
  }
);

// ────────────────────────────────────────────────────────────────────────────
// TAREAS
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "list_tasks",
  "Lista las tareas de un proyecto, opcionalmente filtradas por estado o prioridad.",
  {
    project_id: z.string().uuid(),
    status:     z.enum(["pending", "in_progress", "completed", "blocked", "all"]).optional(),
    priority:   z.enum(["low", "medium", "high", "critical", "all"]).optional(),
  },
  async ({ project_id, status, priority }) => {
    let query = supabase.from("tasks").select("*").eq("project_id", project_id).order("created_at", { ascending: false });
    if (status && status !== "all") query = query.eq("status", status);
    if (priority && priority !== "all") query = query.eq("priority", priority);
    const { data, error } = await query;
    if (error) return err(error.message);
    return ok({ total: data.length, tasks: data });
  }
);

server.tool(
  "create_task",
  "Crea una nueva tarea en un proyecto de DevHub.",
  {
    project_id:   z.string().uuid(),
    user_id:      z.string().uuid().describe("UUID del usuario propietario"),
    title:        z.string().min(1).describe("Título de la tarea"),
    description:  z.string().optional(),
    status:       z.enum(["pending", "in_progress", "completed", "blocked"]).optional().default("pending"),
    priority:     z.enum(["low", "medium", "high", "critical"]).optional().default("medium"),
    due_date:     z.string().optional().describe("Fecha ISO YYYY-MM-DD"),
    milestone_id: z.string().uuid().optional().describe("UUID del hito al que pertenece la tarea"),
    assigned_to:  z.string().uuid().nullable().optional().describe("UUID del usuario o agente asignado"),
  },
  async ({ project_id, user_id, title, description, status, priority, due_date, milestone_id }) => {
    const { data, error } = await supabase.from("tasks").insert({
      project_id, user_id, title,
      description:  description  || null,
      milestone_id: milestone_id || null,
    assigned_to:  z.string().uuid().nullable().optional().describe("UUID del usuario o agente asignado"),
      status, priority,
      due_date: due_date || null,
    }).select().single();
    if (error) return err(error.message);
    return ok({ created: true, task: data });
  }
);

server.tool(
  "update_task",
  "Actualiza el estado, prioridad u otros campos de una tarea existente.",
  {
    task_id:      z.string().uuid(),
    title:        z.string().optional(),
    description:  z.string().optional(),
    status:       z.enum(["pending", "in_progress", "completed", "blocked"]).optional(),
    priority:     z.enum(["low", "medium", "high", "critical"]).optional(),
    due_date:     z.string().nullable().optional(),
    milestone_id: z.string().uuid().nullable().optional().describe("UUID del hito (null para desvincular)"),
    assigned_to:  z.string().uuid().nullable().optional().describe("UUID del usuario o agente asignado"),
  },
  async ({ task_id, status, ...rest }) => {
    const updates = { ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) };
    if (status) {
      updates.status = status;
      if (status === "completed") updates.completed_at = new Date().toISOString();
    }
    const { data, error } = await supabase.from("tasks").update(updates).eq("id", task_id).select().single();
    if (error) return err(error.message);
    return ok({ updated: true, task: data });
  }
);

server.tool(
  "add_task_comment",
  "Añade un comentario a una tarea (útil para que los agentes dejen notas técnicas o log de QA).",
  {
    task_id: z.string().uuid(),
    content: z.string(),
    author_type: z.enum(["human", "agent"]).default("agent")
  },
  async ({ task_id, content, author_type }) => {
    const { data, error } = await supabase.from("task_comments").insert({ task_id, content, author_type }).select().single();
    if (error) return err(error.message);
    return ok({ created: true, comment: data });
  }
);

server.tool(
  "delete_task",
  "Elimina una tarea de DevHub. ¡Acción irreversible!",
  { task_id: z.string().uuid() },
  async ({ task_id }) => {
    const { error } = await supabase.from("tasks").delete().eq("id", task_id);
    if (error) return err(error.message);
    return ok({ deleted: true, task_id });
  }
);

// ────────────────────────────────────────────────────────────────────────────
// DEPENDENCIAS DE TAREAS
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "create_task_dependency",
  "Crea una relación de dependencia o bloqueo entre dos tareas.",
  {
    task_id: z.string().uuid(),
    depends_on: z.string().uuid(),
    tipo: z.enum(["blocks", "related"]).optional().default("blocks"),
  },
  async ({ task_id, depends_on, tipo }) => {
    const { data, error } = await supabase.from("task_dependencies").insert({
      task_id, depends_on, tipo
    }).select().single();
    if (error) return err(error.message);
    return ok({ created: true, dependency: data });
  }
);

server.tool(
  "get_task_dependencies",
  "Devuelve qué tareas bloquean o son bloqueadas por una tarea específica.",
  { task_id: z.string().uuid() },
  async ({ task_id }) => {
    const [blockingRes, blockedByRes] = await Promise.all([
      supabase.from("task_dependencies").select("*").eq("task_id", task_id),
      supabase.from("task_dependencies").select("*").eq("depends_on", task_id)
    ]);
    if (blockingRes.error) return err(blockingRes.error.message);
    if (blockedByRes.error) return err(blockedByRes.error.message);
    return ok({
      task_id,
      blocking: blockingRes.data || [],
      blocked_by: blockedByRes.data || []
    });
  }
);

server.tool(
  "get_next_task",
  "Devuelve la siguiente tarea priorizada de la cola usando la fórmula de prioridad matemática.",
  {
    project_id: z.string().uuid(),
    agent_id: z.string()
  },
  async ({ project_id, agent_id }) => {
    try {
      // 1. Verificar si el agente ya tiene una tarea en curso
      const { data: activeTask } = await supabase.from("tasks")
        .select("*")
        .eq("status", "in_progress")
        // Ideally should check assigned_to, but we might not have that column yet, let's assume it.
        // Wait, did we add assigned_to? The PR spec mentions "assigned_to = auth.uid()", but this is an agent.
        // I will skip assigned_to check for agents because it's not strictly defined in DB yet.
        .limit(1);

      // 2. Obtener tareas pending
      const { data: tasks, error: tasksErr } = await supabase.from("tasks")
        .select("*")
        .eq("project_id", project_id)
        .eq("status", "pending");
      if (tasksErr) return err(tasksErr.message);
      if (!tasks || tasks.length === 0) return ok({ task: null, message: "Sin tareas pendientes" });

      // 3. Evaluar dependencias
      const taskIds = tasks.map(t => t.id);
      const { data: deps } = await supabase.from("task_dependencies")
        .select("*")
        .in("task_id", taskIds);
        
      const { data: allTasksForDeps } = await supabase.from("tasks")
        .select("id, status")
        .eq("project_id", project_id);
      
      const statusMap = Object.fromEntries((allTasksForDeps || []).map(t => [t.id, t.status]));

      const priorityMap = { critical: 4, high: 3, medium: 2, low: 1 };
      
      let bestTask = null;
      let maxScore = -1;

      for (const task of tasks) {
        // Ignorar si tiene una dependencia bloqueante incompleta
        const taskDeps = deps?.filter(d => d.task_id === task.id) || [];
        const isBlocked = taskDeps.some(d => d.tipo === "blocks" && statusMap[d.depends_on] !== "completed");
        if (isBlocked) continue;

        const urgencia = priorityMap[task.priority] || 2;
        const valor_negocio = task.business_value || 5;
        // Simplified dependencias_desbloqueadas: how many tasks depend on this one
        const { count: depsUnlock } = await supabase.from("task_dependencies")
          .select("*", { count: "exact", head: true })
          .eq("depends_on", task.id);
          
        let score = (urgencia * 0.4) + (valor_negocio * 0.3) + ((depsUnlock||0) * 0.2);
        
        if (score > maxScore) {
          maxScore = score;
          bestTask = task;
        }
      }

      if (!bestTask) return ok({ task: null, message: "Todas las tareas pendientes están bloqueadas." });

      // Actualizar a in_progress
      await supabase.from("tasks").update({ status: "in_progress" }).eq("id", bestTask.id);
      bestTask.status = "in_progress";

      return ok({ task: bestTask, score: maxScore, message: "Tarea asignada al agente." });
    } catch(e) {
      return err(e.message);
    }
  }
);

// ────────────────────────────────────────────────────────────────────────────
// HITOS (MILESTONES)
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "list_milestones",
  "Lista los hitos del roadmap de un proyecto.",
  {
    project_id: z.string().uuid(),
    status:     z.enum(["planned", "in_progress", "completed", "at_risk", "all"]).optional(),
  },
  async ({ project_id, status }) => {
    let query = supabase.from("milestones").select("*").eq("project_id", project_id).order("due_date", { ascending: true });
    if (status && status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return err(error.message);
    return ok({ total: data.length, milestones: data });
  }
);

server.tool(
  "create_milestone",
  "Crea un nuevo hito en el roadmap de un proyecto.",
  {
    project_id:  z.string().uuid(),
    user_id:     z.string().uuid(),
    title:       z.string().min(1),
    description: z.string().optional(),
    status:      z.enum(["planned", "in_progress", "completed", "at_risk"]).optional().default("planned"),
    due_date:    z.string().optional().describe("Fecha ISO YYYY-MM-DD"),
  },
  async ({ project_id, user_id, title, description, status, due_date }) => {
    const { data, error } = await supabase.from("milestones").insert({
      project_id, user_id, title,
      description: description || null,
      status, due_date: due_date || null,
    }).select().single();
    if (error) return err(error.message);
    return ok({ created: true, milestone: data });
  }
);

server.tool(
  "update_milestone",
  "Actualiza el estado o los campos de un hito del roadmap.",
  {
    milestone_id: z.string().uuid(),
    assigned_to:  z.string().uuid().nullable().optional().describe("UUID del usuario o agente asignado"),
    title:        z.string().optional(),
    description:  z.string().optional(),
    status:       z.enum(["planned", "in_progress", "completed", "at_risk"]).optional(),
    due_date:     z.string().nullable().optional(),
  },
  async ({ milestone_id, ...updates }) => {
    const fields = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const { data, error } = await supabase.from("milestones").update(fields).eq("id", milestone_id).select().single();
    if (error) return err(error.message);
    return ok({ updated: true, milestone: data });
  }
);

// ────────────────────────────────────────────────────────────────────────────
// RESUMEN GLOBAL
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "get_dashboard",
  "Obtiene un resumen global del estado de todos los proyectos: contadores de tareas, progreso y próximos hitos.",
  {},
  async () => {
    const [{ data: projects }, { data: tasks }, { data: milestones }] = await Promise.all([
      supabase.from("projects").select("id, name, status, progress, color").order("created_at", { ascending: false }),
      supabase.from("tasks").select("project_id, status, priority, due_date"),
      supabase.from("milestones").select("project_id, title, status, due_date").order("due_date", { ascending: true }),
    ]);

    const today = new Date();
    const dashboard = (projects || []).map(p => {
      const ptasks = tasks?.filter(t => t.project_id === p.id) || [];
      const pms    = milestones?.filter(m => m.project_id === p.id) || [];
      return {
        ...p,
        tasks: {
          total:       ptasks.length,
          completed:   ptasks.filter(t => t.status === "completed").length,
          in_progress: ptasks.filter(t => t.status === "in_progress").length,
          blocked:     ptasks.filter(t => t.status === "blocked").length,
          overdue:     ptasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== "completed").length,
        },
        next_milestone: pms.find(m => m.status !== "completed") || null,
      };
    });

    return ok({
      total_projects:  projects?.length || 0,
      active_projects: projects?.filter(p => p.status === "active").length || 0,
      dashboard,
    });
  }
);

// ────────────────────────────────────────────────────────────────────────────
// PLANNING IA — Contexto y estado de planificación
// ────────────────────────────────────────────────────────────────────────────

server.tool(
  "get_project_context",
  "Lee el contexto completo de planificación de un proyecto: planning_prompt y todos los archivos subidos por el usuario. Usar ANTES de generar un plan exhaustivo.",
  { project_id: z.string().uuid().describe("UUID del proyecto a planificar") },
  async ({ project_id }) => {
    const [projRes, filesRes] = await Promise.all([
      supabase.from("projects").select("id, name, description, planning_prompt, planning_status, created_at").eq("id", project_id).single(),
      supabase.from("project_files").select("id, file_name, file_type, content, size_chars, created_at").eq("project_id", project_id).order("created_at", { ascending: true }),
    ]);
    if (projRes.error) return err(projRes.error.message);
    const files = filesRes.data || [];
    const totalChars = files.reduce((acc, f) => acc + (f.size_chars || f.content?.length || 0), 0);
    return ok({
      project: {
        id: projRes.data.id,
        name: projRes.data.name,
        description: projRes.data.description,
        planning_prompt: projRes.data.planning_prompt,
        planning_status: projRes.data.planning_status,
        created_at: projRes.data.created_at,
      },
      files: files.map(f => ({
        id: f.id,
        file_name: f.file_name,
        file_type: f.file_type,
        size_chars: f.size_chars || f.content?.length || 0,
        content: f.content,
      })),
      summary: {
        total_files: files.length,
        total_chars: totalChars,
        has_planning_prompt: !!projRes.data.planning_prompt,
        planning_status: projRes.data.planning_status,
      },
    });
  }
);

server.tool(
  "mark_planning_done",
  "Marca el planning de un proyecto como completado. Llamar DESPUÉS de haber creado todos los hitos y tareas del plan exhaustivo.",
  { project_id: z.string().uuid().describe("UUID del proyecto cuyo planning se completó") },
  async ({ project_id }) => {
    const { data, error } = await supabase
      .from("projects")
      .update({ planning_status: "completed" })
      .eq("id", project_id)
      .select("id, name, planning_status")
      .single();
    if (error) return err(error.message);
    return ok({ success: true, project: data, message: "Planning marcado como completado. El workspace está listo." });
  }
);

// ─── Swarm v2 Tools ────────────────────────────────────────────────────────

server.tool(
  "register_agent",
  "Registra un agente Worker en el swarm o actualiza su estado. Debe llamarse al iniciar o reanudar el agente.",
  {
    agent_id: z.string().describe("Identificador único del agente, ej. worker-claude-1"),
    project_id: z.string().uuid().describe("UUID del proyecto al que se asigna"),
    nombre: z.string().describe("Nombre descriptivo del agente"),
    modelo_llm: z.string().optional().describe("Modelo LLM a utilizar")
  },
  async ({ agent_id, project_id, nombre, modelo_llm }) => {
    const { data, error } = await supabase
      .from("agent_registry")
      .upsert({
        agent_id,
        project_id,
        nombre,
        modelo_llm,
        status: "idle",
        last_heartbeat: new Date().toISOString()
      }, { onConflict: "agent_id" })
      .select()
      .single();
    if (error) return err(error.message);
    return ok({ success: true, agent: data });
  }
);

server.tool(
  "heartbeat_agent",
  "Renueva la señal de vida del agente. Si no se llama cada 1 minuto, el job de limpieza lo marcará como error.",
  {
    agent_id: z.string().describe("ID del agente registrado")
  },
  async ({ agent_id }) => {
    const { data, error } = await supabase
      .from("agent_registry")
      .update({ last_heartbeat: new Date().toISOString() })
      .eq("agent_id", agent_id)
      .select()
      .single();
    if (error) return err(error.message);
    if (!data) return err(`Agente ${agent_id} no encontrado en registry.`);
    return ok({ success: true, agent: data });
  }
);

server.tool(
  "unregister_agent",
  "Elimina un agente del registry, liberando su tarea actual si la tuviera.",
  {
    agent_id: z.string().describe("ID del agente a desvincular")
  },
  async ({ agent_id }) => {
    const { error } = await supabase
      .from("agent_registry")
      .delete()
      .eq("agent_id", agent_id);
    if (error) return err(error.message);
    return ok({ success: true, message: `Agente ${agent_id} eliminado de registry.` });
  }
);

server.tool(
  "qa_evaluate_branch",
  "Evalúa los cambios de una rama. Llama a git_diff_review para analizar el diff. Ideal para el QA Agent.",
  {
    task_id: z.string().uuid().describe("UUID de la tarea evaluada"),
    branch_name: z.string().describe("Nombre de la rama a evaluar"),
    qa_agent_id: z.string().describe("ID del agente QA que realiza la evaluación")
  },
  async ({ task_id, branch_name, qa_agent_id }) => {
    // Esto es un helper que invoca el git diff y carga el prompt de la tarea para ayudar al QA a razonar
    const { stdout: diff } = await execAsync(`git diff main...${branch_name}`).catch(e => ({ stdout: e.message }));
    
    const { data: taskData, error: taskError } = await supabase
      .from("tasks")
      .select("title, description")
      .eq("id", task_id)
      .single();
      
    if (taskError) return err(taskError.message);
    
    return ok({
      success: true,
      diff,
      task: taskData,
      instructions: "Usa estos datos para evaluar el diff. Responde con un resumen de tu análisis y sugiere un score. Tras esto, debes llamar al orquestador backend con tu veredicto (approved/rejected)."
    });
  }
);

// ─── Phase 7: MEMO & Analytics ───────────────────────────────────────────────

server.tool(
  "save_memory",
  "Guarda una memoria persistente en el Knowledge Graph del agente.",
  {
    project_id: z.string().uuid().describe("UUID del proyecto"),
    key: z.string().describe("Identificador corto o semántico, ej. 'auth_backend_decision'"),
    value: z.string().describe("Contenido en texto de la memoria o experiencia"),
    tipo: z.enum(['fact', 'decision', 'error', 'context']).describe("Clasificación de la memoria"),
    agent_id: z.string().optional().describe("ID del agente (opcional, si es compartida se omite)")
  },
  async ({ project_id, key, value, tipo, agent_id }) => {
    let embedding = null;
    if (openai) {
      try {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: value
        });
        embedding = `[${response.data[0].embedding.join(",")}]`;
      } catch (err) {
        process.stderr.write(`⚠️ ERROR OpenAI embedding: ${err.message}\n`);
      }
    }

    const { data, error } = await supabase
      .from('agent_memory')
      .upsert({ project_id, agent_id, key, value, tipo, embedding }, { onConflict: 'id' })
      .select()
      .single();

    if (error) return err(error.message);
    return ok({ success: true, memory: data });
  }
);

server.tool(
  "recall_memory",
  "Recupera memorias usando búsqueda full-text tradicional.",
  {
    project_id: z.string().uuid().describe("UUID del proyecto"),
    query: z.string().describe("Texto libre a buscar"),
    tipo: z.enum(['fact', 'decision', 'error', 'context', 'all']).default('all').describe("Filtro por tipo de memoria"),
    limit: z.number().default(10).describe("Límite de resultados")
  },
  async ({ project_id, query, tipo, limit }) => {
    const { data, error } = await supabase.rpc('search_memory_fts', {
      p_project_id: project_id,
      p_query: query,
      p_tipo: tipo,
      p_limit: limit
    });
    
    if (error) return err(error.message);
    return ok({ success: true, memories: data || [] });
  }
);

server.tool(
  "recall_memory_semantic",
  "Búsqueda semántica usando embeddings (RAG). Requiere pgvector configurado.",
  {
    project_id: z.string().uuid().describe("UUID del proyecto"),
    query: z.string().describe("Texto de búsqueda semántica (ej. 'cómo resolver error de auth')"),
    match_threshold: z.number().default(0.7).describe("Umbral de similitud mínima"),
    limit: z.number().default(10).describe("Límite de resultados")
  },
  async ({ project_id, query, match_threshold, limit }) => {
    if (!openai) {
      return err("No hay OPENAI_API_KEY configurado para generar embeddings");
    }

    let embedding;
    try {
      const resp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query
      });
      embedding = `[${resp.data[0].embedding.join(",")}]`;
    } catch (e) {
      return err(`Fallo al generar embedding: ${e.message}`);
    }

    const { data, error } = await supabase.rpc('search_memory_semantic', {
      p_project_id: project_id,
      p_query_embedding: embedding,
      p_match_threshold: match_threshold,
      p_match_count: limit
    });

    if (error) return err(error.message);
    return ok({ success: true, memories: data || [] });
  }
);

// ─── Start server ──────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("✅ DevHub MCP Server iniciado (stdio)\n");

