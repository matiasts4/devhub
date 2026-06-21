import { z } from 'zod';

import {
  PROJECT_ID_SCHEMA,
  UUID_OR_LEGACY_ID_SCHEMA,
  WORKSPACE_ID_SCHEMA,
} from './schemas/common.js';

export function registerProjectTools(server, deps) {
  const { supabase, ok, err, randomUUID, getActor, writeAuditLog, localUserId } = deps;

  // devhub-cloud-foundation (PR 3): the hardcoded user identifier
  // is removed. The actor is resolved per-request via the AuthProvider
  // port (default: synthetic local-user in local mode; the actual
  // authenticated user in cloud mode).
  const getActorUserId = async () => {
    try {
      if (typeof getActor === 'function') {
        const session = await getActor();
        if (session && session.user && session.user.id) {
          return session.user.id;
        }
      }
    } catch {
      /* fall through to default */
    }
    // Defensive fallback: if the AuthProvider port is unavailable,
    // the local-user literal is the only acceptable default. This
    // is the one allowed occurrence per the hardcoded-local-user
    // contract test.
    return 'local-user';
  };

  async function getProjectRole(projectId) {
    const session = await getActor();
    const userId = session?.user?.id;
    if (!userId) return null;

    // Project owner always has owner role
    const { data: project } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .maybeSingle();
    if (project?.user_id === userId) return 'owner';

    // Explicit project membership
    const { data: membership } = await supabase
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();
    return membership?.role || null;
  }

  function requireProjectRole(role, allowed) {
    if (!allowed.includes(role)) {
      return err(
        `Permiso denegado: se requiere uno de los roles [${allowed.join(', ')}] para este proyecto.`
      );
    }
    return null;
  }

  async function getPersonalWorkspaceId(userId) {
    if (userId === localUserId) return 'local-ws';

    const slug = `personal-${userId}`;
    const { data: bySlug } = await supabase
      .from('workspaces')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (bySlug?.id) return bySlug.id;

    const { data: fallback } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .maybeSingle();
    return fallback?.workspace_id || null;
  }

  server.tool(
    'list_projects',
    'Lista todos los proyectos del usuario en DevHub con su progreso y estado.',
    {
      status: z
        .enum(['active', 'paused', 'completed', 'archived', 'all'])
        .optional()
        .describe('Filtrar por estado. Default: all'),
      workspace_id: WORKSPACE_ID_SCHEMA.optional().describe(
        'devhub-cloud-foundation: required in cloud mode; auto-filled with local-ws in local-dev'
      ),
    },
    async ({ status, workspace_id }) => {
      const userId = await getActorUserId();

      // Collect projects the actor owns or is a member of
      const [{ data: owned }, { data: memberships }] = await Promise.all([
        supabase.from('projects').select('id').eq('user_id', userId),
        supabase.from('project_members').select('project_id').eq('user_id', userId),
      ]);

      const allowedIds = new Set([
        ...(owned || []).map((p) => p.id),
        ...(memberships || []).map((m) => m.project_id),
      ]);

      let query = supabase
        .from('projects')
        .select('id, name, status, progress, workspace_id')
        .order('created_at', { ascending: false });
      if (status && status !== 'all') query = query.eq('status', status);
      if (workspace_id) query = query.eq('workspace_id', workspace_id);
      const { data, error } = await query;
      if (error) return err(error.message);

      const projects = (data || []).filter((p) => allowedIds.size === 0 || allowedIds.has(p.id));
      return ok({ total: projects.length, projects });
    }
  );

  server.tool(
    'get_project',
    'Obtiene todos los detalles de un proyecto específico incluyendo sus tareas e hitos.',
    { project_id: PROJECT_ID_SCHEMA, workspace_id: WORKSPACE_ID_SCHEMA.optional() },
    async ({ project_id, workspace_id }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member', 'viewer']);
      if (permError) return permError;

      const [projRes, tasksRes, msRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', project_id).single(),
        supabase
          .from('tasks')
          .select('*')
          .eq('project_id', project_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('milestones')
          .select('*')
          .eq('project_id', project_id)
          .order('due_date', { ascending: true }),
      ]);
      if (projRes.error) return err(projRes.error.message);
      return ok({
        project: projRes.data,
        tasks: (tasksRes.data || []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
        })),
        milestones: (msRes.data || []).map((m) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          due_date: m.due_date,
        })),
        summary: {
          total_tasks: tasksRes.data?.length || 0,
          completed_tasks: tasksRes.data?.filter((t) => t.status === 'completed').length || 0,
          in_progress: tasksRes.data?.filter((t) => t.status === 'in_progress').length || 0,
          qa_ready: tasksRes.data?.filter((t) => t.status === 'qa_ready').length || 0,
          blocked: tasksRes.data?.filter((t) => t.status === 'blocked').length || 0,
          milestones_done: msRes.data?.filter((m) => m.status === 'completed').length || 0,
        },
      });
    }
  );

  server.tool(
    'update_project',
    'Actualiza los campos de un proyecto (nombre, descripción, progreso, estado, color, planning_status).',
    {
      project_id: PROJECT_ID_SCHEMA,
      name: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
      progress: z.number().min(0).max(100).optional(),
      color: z.string().optional(),
      planning_status: z
        .enum(['none', 'pending', 'completed'])
        .optional()
        .describe('Estado del planning IA del proyecto'),
    },
    async ({ project_id, ...updates }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin']);
      if (permError) return permError;

      const fields = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      if (Object.keys(fields).length === 0)
        return err('No se proporcionaron campos para actualizar');
      const { data, error } = await supabase
        .from('projects')
        .update(fields)
        .eq('id', project_id)
        .select()
        .single();
      if (error) return err(error.message);
      if (!data) return err(`Proyecto ${project_id} no encontrado.`);
      return ok({ updated: true, project: data });
    }
  );

  server.tool(
    'create_project',
    'Crea un nuevo proyecto en DevHub con nombre, descripción y opciones de configuración.',
    {
      name: z.string().min(1).describe('Nombre del proyecto'),
      description: z.string().optional().describe('Descripción breve del proyecto'),
      color: z.string().optional().describe('Color de acento en hex (ej. #58A6FF)'),
      project_type: z
        .enum(['software', 'university', 'research', 'security', 'business', 'creative'])
        .optional()
        .describe('Tipo de proyecto. Default: software'),
      documentation_policy: z
        .enum(['personal', 'shared', 'file-only'])
        .optional()
        .describe('Política de documentación. Default: personal'),
      local_path: z.string().optional().describe('Ruta local del proyecto en disco'),
      planning_prompt: z.string().optional().describe('Prompt para el planning IA automático'),
    },
    async ({
      name,
      description,
      color,
      project_type,
      documentation_policy,
      local_path,
      planning_prompt,
    }) => {
      const userId = await getActorUserId();
      const workspaceId = await getPersonalWorkspaceId(userId);
      const id = randomUUID();
      const payload = {
        id,
        user_id: userId,
        workspace_id: workspaceId,
        name,
        description: description || '',
        color: color || '#58A6FF',
        project_type: project_type || 'software',
        documentation_policy: documentation_policy || 'personal',
        local_path: local_path || '',
        planning_prompt: planning_prompt || '',
        status: 'active',
        progress: 0,
      };
      const { data, error } = await supabase.from('projects').insert(payload).select().single();
      if (error) return err(error.message);

      // Ensure owner membership record for the new project
      await supabase
        .from('project_members')
        .insert({
          project_id: id,
          user_id: userId,
          role: 'owner',
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      return ok({ created: true, project: data });
    }
  );

  server.tool(
    'delete_project',
    'Elimina un proyecto de DevHub y todas sus tareas, hitos y archivos asociados.',
    {
      project_id: PROJECT_ID_SCHEMA.describe('UUID del proyecto a eliminar'),
      confirm: z
        .boolean()
        .describe('Debe ser true para confirmar la eliminación. Previene borrados accidentales.'),
    },
    async ({ project_id, confirm }) => {
      if (!confirm)
        return err('Debes pasar confirm: true para confirmar la eliminación del proyecto.');

      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin']);
      if (permError) return permError;

      const { data: proj } = await supabase
        .from('projects')
        .select('id, name')
        .eq('id', project_id)
        .single();
      if (!proj) return err(`Proyecto ${project_id} no encontrado.`);

      await supabase.from('tasks').delete().eq('project_id', project_id);
      await supabase.from('milestones').delete().eq('project_id', project_id);
      await supabase.from('project_files').delete().eq('project_id', project_id);
      await supabase.from('project_members').delete().eq('project_id', project_id);

      const { error } = await supabase.from('projects').delete().eq('id', project_id);
      if (error) return err(error.message);
      return ok({ deleted: true, project_id, name: proj.name });
    }
  );

  server.tool(
    'list_milestones',
    'Lista los hitos del roadmap de un proyecto.',
    {
      project_id: PROJECT_ID_SCHEMA,
      status: z.enum(['planned', 'in_progress', 'completed', 'at_risk', 'all']).optional(),
    },
    async ({ project_id, status }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member', 'viewer']);
      if (permError) return permError;

      let query = supabase
        .from('milestones')
        .select('*')
        .eq('project_id', project_id)
        .order('due_date', { ascending: true });
      if (status && status !== 'all') query = query.eq('status', status);
      const { data, error } = await query;
      if (error) return err(error.message);
      return ok({ total: data.length, milestones: data });
    }
  );

  server.tool(
    'create_milestone',
    'Crea un nuevo hito en el roadmap de un proyecto.',
    {
      project_id: PROJECT_ID_SCHEMA,
      user_id: z.string().uuid(),
      title: z.string().min(1),
      description: z.string().optional(),
      status: z
        .enum(['planned', 'in_progress', 'completed', 'at_risk'])
        .optional()
        .default('planned'),
      due_date: z.string().optional().describe('Fecha ISO YYYY-MM-DD'),
    },
    async ({ project_id, user_id, title, description, status, due_date }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member']);
      if (permError) return permError;

      const actorUserId = await getActorUserId();
      const { data, error } = await supabase
        .from('milestones')
        .insert({
          project_id,
          user_id: user_id || actorUserId,
          title,
          description: description || null,
          status,
          due_date: due_date || null,
        })
        .select()
        .single();
      if (error) return err(error.message);
      return ok({ created: true, milestone: data });
    }
  );

  server.tool(
    'bulk_create_milestones',
    'Crea múltiples hitos de roadmap de forma idempotente: si ya existe un hito con el mismo título en el proyecto, lo omite.',
    {
      project_id: PROJECT_ID_SCHEMA,
      user_id: z.string().uuid(),
      milestones: z
        .array(
          z.object({
            title: z.string().min(1),
            description: z.string().optional(),
            status: z.enum(['planned', 'in_progress', 'completed', 'at_risk']).optional(),
            due_date: z.string().optional(),
          })
        )
        .min(1)
        .max(50),
    },
    async ({ project_id, user_id, milestones }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member']);
      if (permError) return permError;

      const actorUserId = await getActorUserId();
      const { data: existing, error: existingErr } = await supabase
        .from('milestones')
        .select('id, title')
        .eq('project_id', project_id);
      if (existingErr) return err(existingErr.message);

      const existingTitles = new Set((existing || []).map((m) => m.title.trim().toLowerCase()));
      const seenTitles = new Set();
      const skipped = [];
      const payload = [];

      for (const milestone of milestones) {
        const key = milestone.title.trim().toLowerCase();
        if (existingTitles.has(key) || seenTitles.has(key)) {
          skipped.push({ title: milestone.title, reason: 'duplicate-title' });
          continue;
        }
        seenTitles.add(key);
        payload.push({
          project_id,
          user_id: user_id || actorUserId,
          title: milestone.title,
          description: milestone.description || null,
          status: milestone.status || 'planned',
          due_date: milestone.due_date || null,
        });
      }

      if (payload.length === 0) {
        return ok({ created_count: 0, skipped_count: skipped.length, milestones: [], skipped });
      }

      const { data, error } = await supabase.from('milestones').insert(payload).select();
      if (error) return err(error.message);
      return ok({
        created_count: data.length,
        skipped_count: skipped.length,
        milestones: data,
        skipped,
      });
    }
  );

  server.tool(
    'update_milestone',
    'Actualiza el estado o los campos de un hito del roadmap.',
    {
      milestone_id: UUID_OR_LEGACY_ID_SCHEMA,
      assigned_to: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe('UUID del usuario o agente asignado'),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['planned', 'in_progress', 'completed', 'at_risk']).optional(),
      due_date: z.string().nullable().optional(),
    },
    async ({ milestone_id, ...updates }) => {
      const { data: milestone } = await supabase
        .from('milestones')
        .select('project_id')
        .eq('id', milestone_id)
        .maybeSingle();
      if (!milestone) return err(`Hito ${milestone_id} no encontrado.`);

      const role = await getProjectRole(milestone.project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member']);
      if (permError) return permError;

      const fields = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      const { data, error } = await supabase
        .from('milestones')
        .update(fields)
        .eq('id', milestone_id)
        .select()
        .single();
      if (error) return err(error.message);
      if (!data) return err(`Hito ${milestone_id} no encontrado.`);
      return ok({ updated: true, milestone: data });
    }
  );

  server.tool(
    'get_project_context',
    'Lee el contexto completo de planificación de un proyecto: planning_prompt, archivos, hitos y tareas existentes. Usar ANTES de generar o continuar un plan.',
    { project_id: PROJECT_ID_SCHEMA.describe('UUID del proyecto a planificar') },
    async ({ project_id }) => {
      const role = await getProjectRole(project_id);
      const permError = requireProjectRole(role, ['owner', 'admin', 'member', 'viewer']);
      if (permError) return permError;

      const [projRes, filesRes, milestonesRes, tasksRes] = await Promise.all([
        supabase
          .from('projects')
          .select(
            'id, name, description, planning_prompt, planning_status, project_type, documentation_policy, progress, created_at'
          )
          .eq('id', project_id)
          .single(),
        supabase
          .from('project_files')
          .select('id, file_name, file_type, content, size_chars, created_at')
          .eq('project_id', project_id)
          .order('created_at', { ascending: true }),
        supabase
          .from('milestones')
          .select('id, title, description, status, due_date, created_at')
          .eq('project_id', project_id)
          .order('created_at', { ascending: true }),
        supabase
          .from('tasks')
          .select('id, title, description, status, priority, milestone_id, due_date, created_at')
          .eq('project_id', project_id)
          .order('created_at', { ascending: true }),
      ]);
      if (projRes.error) return err(projRes.error.message);
      const files = filesRes.data || [];
      const milestones = milestonesRes.data || [];
      const tasks = tasksRes.data || [];
      const totalChars = files.reduce(
        (acc, f) => acc + (f.size_chars || f.content?.length || 0),
        0
      );
      const tasksByStatus = tasks.reduce((acc, task) => {
        const status = task.status || 'pending';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      return ok({
        project: {
          id: projRes.data.id,
          name: projRes.data.name,
          description: projRes.data.description,
          planning_prompt: projRes.data.planning_prompt,
          planning_status: projRes.data.planning_status,
          project_type: projRes.data.project_type,
          documentation_policy: projRes.data.documentation_policy,
          progress: projRes.data.progress,
          created_at: projRes.data.created_at,
        },
        files: files.map((f) => ({
          id: f.id,
          file_name: f.file_name,
          file_type: f.file_type,
          size_chars: f.size_chars || f.content?.length || 0,
          content: f.content,
        })),
        roadmap: {
          milestones: milestones.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            status: m.status,
            due_date: m.due_date,
          })),
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            milestone_id: t.milestone_id,
            due_date: t.due_date,
          })),
        },
        summary: {
          total_files: files.length,
          total_chars: totalChars,
          has_planning_prompt: !!projRes.data.planning_prompt,
          planning_status: projRes.data.planning_status,
          total_milestones: milestones.length,
          total_tasks: tasks.length,
          tasks_by_status: tasksByStatus,
        },
      });
    }
  );
}
