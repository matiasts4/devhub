import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
  pollXaiDeviceFlow,
  fetchXaiUsername,
  clearXaiOAuthCache,
  listXaiChatModels,
  XAI_SUBSCRIPTION_PINNED_MODELS,
} from '@/lib/xai-oauth';
import { invalidateLlmProviderConfigCache } from '@/lib/llmProviderConfig';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');

/**
 * POST /api/settings/llm-providers/xai/poll
 * Body: { device_code: string }
 *
 * One poll round. On success, persists OAuth tokens on providers.xai and
 * sets XAI_AUTH_MODE=oauth.
 */
export async function POST(request) {
  try {
    const { device_code: deviceCode } = await request.json();
    if (!deviceCode) {
      return NextResponse.json({ error: 'device_code requerido' }, { status: 400 });
    }

    const result = await pollXaiDeviceFlow(deviceCode);

    if (result.status === 'pending' || result.status === 'slow_down') {
      return NextResponse.json({
        status: result.status === 'slow_down' ? 'pending' : result.status,
        interval: result.interval,
      });
    }
    if (result.status === 'expired') {
      return NextResponse.json({ status: 'expired' });
    }
    if (result.status === 'denied' || result.status === 'error') {
      return NextResponse.json({
        status: 'error',
        error: result.error || 'Error de autenticación xAI',
      });
    }

    const username = await fetchXaiUsername(result.access_token);
    await persistXaiOAuthTokens({
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: result.expires_at,
      username,
    });
    clearXaiOAuthCache();
    invalidateLlmProviderConfigCache();

    return NextResponse.json({ status: 'success', username });
  } catch (err) {
    return NextResponse.json({ status: 'error', error: err.message });
  }
}

async function persistXaiOAuthTokens({ accessToken, refreshToken, expiresAt, username }) {
  let config = {};
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
  } catch {
    config = {
      providers: {},
      priorityOrder: ['xai', 'copilot', 'minimax', 'opencode', 'openrouter'],
      bridgeEnabled: true,
    };
  }

  if (!config.providers) config.providers = {};
  if (!config.providers.xai) config.providers.xai = {};

  const xai = config.providers.xai;
  xai.XAI_AUTH_MODE = 'oauth';
  xai.XAI_OAUTH_ACCESS_TOKEN = accessToken;
  xai.XAI_OAUTH_REFRESH_TOKEN = refreshToken || xai.XAI_OAUTH_REFRESH_TOKEN || '';
  xai.XAI_OAUTH_EXPIRES_AT = expiresAt;
  xai.XAI_OAUTH_USERNAME = username || 'SuperGrok';
  xai.enabled = true;

  if (!xai.XAI_BASE_URL) {
    xai.XAI_BASE_URL = 'https://api.x.ai/v1/chat/completions';
  }

  // Live catalog: API + SuperGrok CLI proxy (Composer 2.5, Grok 4.5, …)
  if (!config.modelOptions) config.modelOptions = {};
  let liveModels = [];
  try {
    const listed = await listXaiChatModels({
      accessToken,
      includeSubscriptionCatalog: true,
      pinSubscriptionModels: true,
    });
    liveModels = listed.models || [];
  } catch {
    liveModels = [];
  }
  if (!liveModels.length) {
    liveModels = [...XAI_SUBSCRIPTION_PINNED_MODELS];
  }
  const existing = Array.isArray(config.modelOptions.xai) ? config.modelOptions.xai : [];
  const merged = [...liveModels];
  for (const m of existing) {
    if (!merged.includes(m)) merged.push(m);
  }
  config.modelOptions.xai = merged;

  if (!xai.XAI_MODEL || !merged.includes(xai.XAI_MODEL)) {
    // Prefer flagship subscription models when available.
    xai.XAI_MODEL =
      merged.find((m) => m === 'grok-4.5') ||
      merged.find((m) => m === 'grok-build-0.1') ||
      merged[0] ||
      'grok-4.5';
  }

  await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
