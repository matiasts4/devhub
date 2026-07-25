import { NextResponse } from 'next/server';
import { assembleMcpControlCenterSnapshot } from '@/lib/mcp/control-center';

const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4153;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

/**
 * GET /api/agenthub/mcp/status
 *
 * Returns the status of connected MCP servers and their tools.
 * If OpenCode exposes MCP info via its API, we use that.
 * Otherwise, we return the known configured servers.
 */
export async function GET() {
  try {
    const snapshot = await assembleMcpControlCenterSnapshot({
      fetchImpl: fetch,
      serverUrl: SERVER_URL,
      now: new Date().toISOString(),
    });

    return NextResponse.json(snapshot);
  } catch (err) {
    console.error('Error fetching MCP status:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
