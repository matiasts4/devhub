import { NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';

async function connectToMcpServer() {
  const serverPath = path.resolve(process.cwd(), 'devhub-mcp/server.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
  });
  const client = new Client({ name: 'centro-ia-sidecar', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

export async function POST(req) {
  try {
    const { query, project_id } = await req.json();
    if (!query || !project_id)
      return NextResponse.json({ error: 'Missing query or project_id' }, { status: 400 });

    let memories = [];
    let mcpConnection;
    try {
      mcpConnection = await connectToMcpServer();
      const { client, transport } = mcpConnection;
      try {
        const result = await client.callTool({
          name: 'recall_memory',
          arguments: {
            project_id,
            query,
            tipo: 'all',
            limit: 5,
          },
        });
        await transport.close();
        if (!result.isError && result.content?.[0]?.text) {
          const data = JSON.parse(result.content[0].text);
          if (data.success && data.memories) memories = data.memories;
        }
      } catch {
        await transport.close();
      }
    } catch {
      // MCP unavailable, continue with empty memories
    }

    const combined = memories.length
      ? memories.map((m) => `- ${m.key} (${m.tipo}): ${m.value}`).join('\n')
      : 'No se encontraron datos.';

    return NextResponse.json({
      answer: `Basado en la memoria del proyecto:\n${combined}`,
      sources: memories,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
