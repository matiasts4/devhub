import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { NextResponse } from 'next/server';
import path from 'path';

// Function to establish a fresh connection to the local MCP server
async function connectToMcpServer() {
  const serverPath = path.resolve(process.cwd(), 'devhub-mcp/server.js');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
  });

  const client = new Client({ name: 'engram-sidecar', version: '1.0.0' }, { capabilities: {} });

  await client.connect(transport);
  return { client, transport };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const query = searchParams.get('query') || '';
    // Allow filtering by type: fact, decision, error, context, all
    const tipo = searchParams.get('tipo') || 'all';
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId query parameter' }, { status: 400 });
    }

    let mcpConnection;
    try {
      mcpConnection = await connectToMcpServer();
    } catch (connectionError) {
      console.error('MCP Connection Error:', connectionError);
      return NextResponse.json(
        { error: 'Engram MCP server is unavailable', details: connectionError.message },
        { status: 503 }
      );
    }

    const { client, transport } = mcpConnection;

    try {
      // Call the recall_memory tool via MCP
      const result = await client.callTool({
        name: 'recall_memory',
        arguments: {
          project_id: projectId,
          query: query,
          tipo: tipo,
          limit: limit,
        },
      });

      // Cleanup the connection
      await transport.close();

      if (result.isError) {
        // The tool executed but returned an error response
        const errorText = result.content[0]?.text || 'Unknown MCP tool error';
        return NextResponse.json({ error: errorText }, { status: 500 });
      }

      // The MCP server responds with JSON text
      const data = JSON.parse(result.content[0].text);

      // If success is true, return the memories directly to simplify frontend parsing
      if (data.success && data.memories) {
        return NextResponse.json(data.memories);
      }

      return NextResponse.json(data);
    } catch (toolError) {
      // Cleanup the connection on failure
      await transport.close();
      console.error('MCP Tool Execution Error:', toolError);
      return NextResponse.json(
        { error: 'Failed to execute MCP tool', details: toolError.message },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Internal API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
