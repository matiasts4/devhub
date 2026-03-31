const fs = require('fs');

async function run() {
  const filePath = 'devhub-mcp/server.js';
  let content = fs.readFileSync(filePath, 'utf-8');

  // Optimizar list_projects
  content = content.replace(
    /select\('id, name, description, status, progress, color, created_at'\)/g,
    "select('id, name, status, progress')"
  );

  // Optimizar list_tasks
  content = content.replace(
    /let query = supabase\s*\.from\('tasks'\)\s*\.select\('\*'\)/g,
    "let query = supabase.from('tasks').select('id, title, status, priority, description')"
  );

  // Optimizar get_project para no devolver todo
  content = content.replace(
    /tasks: tasksRes\.data \|\| \[\],/g,
    "tasks: (tasksRes.data || []).map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),"
  );
  content = content.replace(
    /milestones: msRes\.data \|\| \[\],/g,
    "milestones: (msRes.data || []).map(m => ({ id: m.id, title: m.title, status: m.status, due_date: m.due_date })),"
  );

  // Optimizar get_next_task return (simplificar objeto)
  content = content.replace(
    /return ok\({ task: bestTask, score: maxScore, message: 'Tarea asignada al agente\.' }\);/g,
    `return ok({ 
        task: {
          id: bestTask.id,
          title: bestTask.title,
          description: bestTask.description,
          priority: bestTask.priority,
          status: bestTask.status
        }, 
        message: 'Tarea asignada al agente.' 
      });`
  );

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('MCP Server optimizado para reducir tokens.');
}

run();
