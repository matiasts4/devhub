/**
 * Execute a single Zed tool step as part of a supervised client-side plan.
 *
 * The client (planExecutor) drives the plan lifecycle; this endpoint only
 * executes one tool at a time, applying the same request context and sandbox
 * rules as the main chat route.
 */

import { NextResponse } from 'next/server';
import { buildZedRegistry } from '@/lib/asistente/buildZedRegistry';
import { zedLog } from '@/lib/asistente/utils/zed-logger';
import { MAX_ZED_TERMINAL_PANELS } from '@/lib/terminal/workspaceTerminalLimits';

export async function POST(request) {
  const msgId = Date.now().toString(36);

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'malformed body' }, { status: 400 });
    }

    const { tool, input: toolInput, context: clientContext = {}, source = 'plan' } = body;

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json({ error: 'tool is required' }, { status: 400 });
    }
    if (!toolInput || typeof toolInput !== 'object') {
      return NextResponse.json({ error: 'input is required' }, { status: 400 });
    }

    const requestContext = {
      ...clientContext,
      source,
      max_terminal_panels: Number(clientContext?.max_terminal_panels) || MAX_ZED_TERMINAL_PANELS,
      terminal_panel_count: Number(clientContext?.terminal_panel_count) || 0,
      workspace_terminals: Array.isArray(clientContext?.workspace_terminals)
        ? clientContext.workspace_terminals
        : [],
      _terminal_opens_this_request: 0,
    };

    const registry = buildZedRegistry();

    zedLog.orchestration('execute_plan_step', { msgId, tool, input: toolInput });

    let result;
    try {
      result = await registry.execute(tool, toolInput, requestContext);
    } catch (err) {
      result = { error: err.message };
    }

    const ok = !result?.error;
    zedLog.toolResult(tool, result, 0);

    return NextResponse.json({
      ok,
      tool,
      input: toolInput,
      result,
      msgId,
    });
  } catch (error) {
    zedLog.error('FATAL', 'Unhandled exception in execute-plan-step', {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
