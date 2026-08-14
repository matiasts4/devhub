import { NextResponse } from 'next/server';
import { fetchAnthropicQuota } from '@/lib/quota/server/anthropic';
import { fetchGrokQuota } from '@/lib/quota/server/grok';
import { fetchAntigravityQuota } from '@/lib/quota/server/antigravity';
import { fetchKimiQuota } from '@/lib/quota/server/kimi';
import { fetchCodexQuota } from '@/lib/quota/server/codex';
import { fetchOpenCodeQuota } from '@/lib/quota/server/opencode';
import { fetchZaiQuota } from '@/lib/quota/server/zai';
import { fetchQoderQuota } from '@/lib/quota/server/qoder';
import { readCachedQuota, writeCachedQuota } from '@/lib/quota/server/quotaCache';
import { PROVIDERS } from '@/lib/quota/types';

export const dynamic = 'force-dynamic';

const SERVER_ADAPTERS = {
  [PROVIDERS.CLAUDE]: fetchAnthropicQuota,
  [PROVIDERS.GROK]: fetchGrokQuota,
  [PROVIDERS.ANTIGRAVITY]: fetchAntigravityQuota,
  [PROVIDERS.KIMI]: fetchKimiQuota,
  [PROVIDERS.CODEX]: fetchCodexQuota,
  [PROVIDERS.OPENCODE]: fetchOpenCodeQuota,
  [PROVIDERS.ZAI]: fetchZaiQuota,
  [PROVIDERS.QODER]: fetchQoderQuota,
};

/**
 * Fetches one provider through the TTL cache. Live failures fall back to a
 * stale cached entry when one exists.
 */
async function fetchProviderCached(providerId, adapter, { force = false } = {}) {
  if (!force) {
    const cached = readCachedQuota(providerId);
    if (cached) return cached;
  }
  try {
    const quota = await adapter();
    writeCachedQuota(providerId, quota);
    return quota;
  } catch (err) {
    const stale = readCachedQuota(providerId, { allowStale: true });
    if (stale) return { ...stale, error: stale.error || err.message };
    return null;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    const force = searchParams.get('force') === '1';

    if (provider) {
      const adapter = SERVER_ADAPTERS[provider];
      if (!adapter) {
        return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
      }
      const quota = await fetchProviderCached(provider, adapter, { force });
      if (!quota) {
        return NextResponse.json({ error: `Failed to fetch quota: ${provider}` }, { status: 502 });
      }
      return NextResponse.json(quota);
    }

    // Optional subset (?providers=kimi,codex) so disabled providers are never probed.
    const providersParam = searchParams.get('providers');
    const requested = providersParam
      ? providersParam
          .split(',')
          .map((id) => id.trim())
          .filter((id) => SERVER_ADAPTERS[id])
      : null;

    // Fetch providers in parallel (cache-first within the TTL window)
    const keys = requested || Object.keys(SERVER_ADAPTERS);
    const results = await Promise.all(
      keys.map((key) => fetchProviderCached(key, SERVER_ADAPTERS[key], { force }))
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
