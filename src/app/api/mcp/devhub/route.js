import { NextResponse } from 'next/server';

/**
 * POST /api/mcp/devhub
 * Proxies MCP tool calls to the DevHub MCP server managed by OpenCode.
 * DevHub MCP exposes tools for projects, tasks, milestones, dashboard, and swarm agents.
 *
 * Available tools:
 *   Proyectos:  list_projects, get_project, create_project, update_project, delete_project
 *   Tareas:     list_tasks, create_task, update_task, delete_task, add_task_comment,
 *               create_task_dependency, get_task_dependencies, get_next_task
 *   Hitos:      list_milestones, create_milestone, update_milestone
 *   Dashboard:  get_dashboard, get_project_context, mark_planning_done
 *   Context:    validate_topic_key, build_context_pack
 *   Swarm:      register_agent, heartbeat_agent, unregister_agent, update_agent_status
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { toolName, args } = body;

    if (!toolName) {
      return NextResponse.json({ error: 'Missing toolName parameter' }, { status: 400 });
    }

    const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4154;
    const SERVER_URL = process.env.OPENCODE_URL || `http://127.0.0.1:${SERVER_PORT}`;

    const response = await fetch(`${SERVER_URL}/mcp/devhub/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toolName, args }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MCP DevHub Proxy Error]', response.status, errorText);

      if (response.status === 404) {
        return NextResponse.json(
          {
            error: `MCP client 'devhub' not found in OpenCode. Ensure it is configured and connected (check ~/.config/opencode/opencode.json mcp.devhub.enabled).`,
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: `OpenCode server error (${response.status}): ${errorText}` },
        { status: 503 }
      );
    }

    const result = await response.json();

    let finalText = '';
    const isError = result.isError || false;

    if (result.content && Array.isArray(result.content)) {
      finalText = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text || '')
        .join('\n');
    }

    return NextResponse.json({
      success: !isError,
      toolName,
      content: finalText,
      raw: result,
    });
  } catch (err) {
    console.error('[MCP DevHub Proxy Connection Error]', err);
    return NextResponse.json(
      {
        error: `Could not connect to OpenCode server: ${err.message}. Make sure 'opencode serve' is running.`,
      },
      { status: 503 }
    );
  }
}
