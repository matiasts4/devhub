import { NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function POST(req) {
  let transport = null;
  let client = null;

  try {
    const body = await req.json();
    const { toolName, args } = body;

    if (!toolName) {
      return NextResponse.json({ error: 'Missing toolName parameter' }, { status: 400 });
    }

    // Initialize the MCP Client
    client = new Client(
      { name: 'devhub-agent-hub', version: '1.0.0' },
      { capabilities: {} }
    );

    // Provide the CLI command for Engram
    transport = new StdioClientTransport({
      command: 'engram',
      args: ['mcp', '--tools=agent'],
    });

    // Connect to the child process MCP
    await client.connect(transport);

    // Call the specific tool
    const result = await client.callTool({
      name: toolName,
      arguments: args || {},
    });

    let finalText = '';
    let isError = false;

    if (result.isError) {
      isError = true;
      finalText = result.content.map((c) => c.text).join('\n');
    } else {
      finalText = result.content.map((c) => c.text).join('\n');
    }

    return NextResponse.json({
      success: !isError,
      toolName,
      content: finalText,
      raw: result,
    });
  } catch (err) {
    console.error('[MCP Engram Error]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    // ALWAYS close the connection so the child process doesn't leak
    if (transport) {
      try {
        await transport.close();
      } catch (e) {
        // ignore close errors
      }
    }
  }
}
