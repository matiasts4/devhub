import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';

async function run() {
  const serverPath = path.resolve(process.cwd(), 'devhub-mcp/server.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
  });

  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    console.log('Connected!');

    // Check available tools
    const tools = await client.listTools();
    console.log(
      'Tools:',
      tools.tools.map((t) => t.name)
    );

    await transport.close();
  } catch (err) {
    console.error('Failed:', err);
  }
}

run();
