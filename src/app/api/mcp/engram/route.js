import { NextResponse } from 'next/server';

/**
 * POST /api/mcp/engram
 * Proxies MCP tool calls to the running OpenCode server.
 * This ensures that both DevHub and OpenCode share the same Engram instance.
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { toolName, args } = body;

    if (!toolName) {
      return NextResponse.json({ error: 'Missing toolName parameter' }, { status: 400 });
    }

    // Use the same port logic as processManager.js
    const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4154;
    const SERVER_URL = process.env.OPENCODE_URL || `http://127.0.0.1:${SERVER_PORT}`;

    const response = await fetch(`${SERVER_URL}/mcp/engram/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ toolName, args }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[MCP Engram Proxy Error]', response.status, errorText);

      // If 404, it means the 'engram' client is not connected to OpenCode
      if (response.status === 404) {
        return NextResponse.json(
          {
            error: `MCP client 'engram' not found in OpenCode. Ensure it is configured and connected.`,
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

    // Result mapping to maintain compatibility with existing frontend
    // Frontend expects: { success, toolName, content, raw }
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
    console.error('[MCP Engram Proxy Connection Error]', err);
    return NextResponse.json(
      {
        error: `Could not connect to OpenCode server: ${err.message}. Make sure 'opencode serve' is running.`,
      },
      { status: 503 }
    );
  }
}
