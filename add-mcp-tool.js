const fs = require('fs');

async function run() {
  const filePath = 'devhub-mcp/server.js';
  let content = fs.readFileSync(filePath, 'utf-8');

  const toolCode = `
server.tool(
  'update_agent_status',
  'Actualiza el estado visual de tu agente en el DevHub Control Center.',
  {
    agent_id: z.string().describe('Tu identificador único de agente asignado'),
    status: z.enum(['running', 'active', 'thinking', 'asking_questions', 'completed', 'failed', 'idle']),
    task_description: z.string().optional().describe('Qué estás haciendo ahora mismo (corto)')
  },
  async ({ agent_id, status, task_description }) => {
    const updateData = { status, last_heartbeat: new Date().toISOString() };
    if (task_description) updateData.task_description = task_description;
    
    const { data, error } = await supabase
      .from('agent_registry')
      .update(updateData)
      .eq('agent_id', agent_id)
      .select()
      .single();
      
    if (error) return err(error.message);
    return ok({ success: true, message: 'Estado actualizado en la UI', agent: data });
  }
);
`;

  if (!content.includes('update_agent_status')) {
    // Insertar antes de Start server
    content = content.replace('// ─── Start server ──────────────────────────────────────────────────────────', toolCode + '\n// ─── Start server ──────────────────────────────────────────────────────────');
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('Tool update_agent_status agregada.');
  } else {
    console.log('Tool ya existe.');
  }
}
run();
