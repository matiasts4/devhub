/* global process */

import { NextResponse } from 'next/server';

const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4153;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

/**
 * Known MCP servers configured in the project.
 * OpenCode headless doesn't expose MCP status via a public API endpoint,
 * so we return a cached/placeholder list of configured servers.
 *
 * Extend this array as new MCP servers are added to the opencode config.
 */
const KNOWN_MCP_SERVERS = [
  {
    name: 'filesystem',
    status: 'connected',
    tools: [
      { name: 'read_file', description: 'Read the contents of a file' },
      { name: 'write_file', description: 'Write content to a file' },
      { name: 'list_directory', description: 'List files in a directory' },
      { name: 'search_files', description: 'Search for files by name or pattern' },
    ],
  },
  {
    name: 'web',
    status: 'connected',
    tools: [
      { name: 'web_fetch', description: 'Fetch content from a URL' },
      { name: 'web_search', description: 'Search the web for information' },
    ],
  },
];

/**
 * GET /api/agenthub/mcp/status
 *
 * Returns the status of connected MCP servers and their tools.
 * If OpenCode exposes MCP info via its API, we use that.
 * Otherwise, we return the known configured servers.
 */
export async function GET() {
  try {
    const observedAt = new Date().toISOString();
    // Try to get MCP info from OpenCode headless API
    // As of current OpenCode versions, there's no dedicated MCP endpoint,
    // so we fall back to known servers.
    let liveServers = null;
    try {
      // Attempt to query OpenCode for MCP info (future-proof)
      const res = await fetch(`${SERVER_URL}/mcp`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2000), // short timeout — don't block
      });
      if (res.ok) {
        liveServers = await res.json();
      }
    } catch {
      // OpenCode doesn't expose MCP status — use placeholder
      liveServers = null;
    }

    if (liveServers && Array.isArray(liveServers)) {
      return NextResponse.json({
        servers: liveServers.map((server) => ({
          ...server,
          authority: 'authoritative',
          freshness: 'current',
          observed_at: observedAt,
        })),
        authority: 'authoritative',
        freshness: 'current',
        observed_at: observedAt,
      });
    }

    return NextResponse.json({
      servers: KNOWN_MCP_SERVERS.map((server) => ({
        ...server,
        authority: 'inferred',
        freshness: 'stale',
        observed_at: observedAt,
      })),
      note: 'MCP status is cached. OpenCode headless does not expose live MCP server info.',
      authority: 'inferred',
      freshness: 'stale',
      observed_at: observedAt,
      status_reason:
        'MCP status is inferred from configured servers because OpenCode does not expose a live MCP endpoint.',
    });
  } catch (err) {
    console.error('Error fetching MCP status:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
