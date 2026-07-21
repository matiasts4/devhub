import { NextResponse } from 'next/server';
import {
  getAgentHookStatus,
  installAgentHook,
  uninstallAgentHook,
} from '@/lib/terminal/agentHooks/installer';

export const dynamic = 'force-dynamic';

function isLocalhostRequest(request) {
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0].toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export async function GET(request) {
  if (!isLocalhostRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Access restricted to localhost' }, { status: 403 });
  }

  try {
    const statuses = {
      kimi: getAgentHookStatus('kimi'),
      claude: getAgentHookStatus('claude'),
      opencode: getAgentHookStatus('opencode'),
    };
    return NextResponse.json({ ok: true, statuses });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isLocalhostRequest(request)) {
    return NextResponse.json({ ok: false, error: 'Access restricted to localhost' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { agent, action } = body || {};

    if (!['kimi', 'claude', 'opencode'].includes(agent)) {
      return NextResponse.json(
        { ok: false, error: "Invalid agent. Allowed: 'kimi', 'claude', 'opencode'" },
        { status: 400 }
      );
    }

    let result;
    if (action === 'uninstall') {
      result = uninstallAgentHook(agent);
    } else {
      result = installAgentHook(agent);
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }
}
