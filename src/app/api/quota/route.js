import { NextResponse } from 'next/server';
import { fetchAnthropicQuota } from '@/lib/quota/server/anthropic';
import { fetchGrokQuota } from '@/lib/quota/server/grok';
import { fetchAntigravityQuota } from '@/lib/quota/server/antigravity';
import { fetchKimiQuota } from '@/lib/quota/server/kimi';
import { fetchCodexQuota } from '@/lib/quota/server/codex';
import { fetchOpenCodeQuota } from '@/lib/quota/server/opencode';
import { PROVIDERS } from '@/lib/quota/types';

export const dynamic = 'force-dynamic';

const SERVER_ADAPTERS = {
  [PROVIDERS.CLAUDE]: fetchAnthropicQuota,
  [PROVIDERS.GROK]: fetchGrokQuota,
  [PROVIDERS.ANTIGRAVITY]: fetchAntigravityQuota,
  [PROVIDERS.KIMI]: fetchKimiQuota,
  [PROVIDERS.CODEX]: fetchCodexQuota,
  [PROVIDERS.OPENCODE]: fetchOpenCodeQuota,
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');

    if (provider) {
      const adapter = SERVER_ADAPTERS[provider];
      if (!adapter) {
        return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
      }
      const quota = await adapter();
      return NextResponse.json(quota);
    }

    // Fetch all providers in parallel
    const keys = Object.keys(SERVER_ADAPTERS);
    const results = await Promise.all(
      keys.map(async (key) => {
        try {
          return await SERVER_ADAPTERS[key]();
        } catch {
          return null;
        }
      })
    );

    const quotas = {};
    results.forEach((res) => {
      if (res && res.providerId) {
        quotas[res.providerId] = res;
      }
    });

    return NextResponse.json(quotas);
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Failed to fetch quotas' }, { status: 500 });
  }
}
