import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

import { invalidateLlmProviderConfigCache } from '@/lib/llmProviderConfig';

const CONFIG_PATH = path.join(process.cwd(), 'data', 'llm-providers-config.json');

const DEFAULT_CONFIG = {
  providers: {},
  priorityOrder: ['copilot', 'openrouter', 'zen', 'direct'],
  bridgeEnabled: true,
  modelOptions: {},
  favoriteModels: {},
};

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      providers: parsed?.providers || {},
      priorityOrder: parsed?.priorityOrder || DEFAULT_CONFIG.priorityOrder,
      modelOptions: parsed?.modelOptions || {},
      favoriteModels: parsed?.favoriteModels || {},
      bridgeEnabled: parsed?.bridgeEnabled !== false,
      globalTemperature: parsed?.globalTemperature ?? 0.7,
      globalMaxTokens: parsed?.globalMaxTokens ?? 4000,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(config) {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const providerKey = searchParams.get('provider');

  if (providerKey) {
    const cfg = await loadConfig();
    const provider = cfg?.providers?.[providerKey];
    if (!provider) {
      return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });
    }
    // Individual provider response — consistent format for all providers
    switch (providerKey) {
      case 'minimax':
        return NextResponse.json({
          id: 'minimax',
          name: 'MiniMax M2.7',
          enabled: provider.enabled !== false,
          status: provider.enabled !== false ? 'active' : 'disabled',
        });
      case 'openrouter':
        return NextResponse.json({
          id: 'openrouter',
          name: 'OpenRouter',
          enabled: !!provider.OPENROUTER_API_KEY,
          status: provider.OPENROUTER_API_KEY ? 'active' : 'no-api-key',
        });
      case 'copilot':
        return NextResponse.json({
          id: 'copilot',
          name: 'GitHub Copilot',
          enabled: !!provider.COPILOT_OAUTH_TOKEN,
          status: provider.COPILOT_OAUTH_TOKEN ? 'active' : 'no-token',
        });
      case 'opencode':
        return NextResponse.json({
          id: 'opencode',
          name: 'OpenCode',
          enabled: provider.enabled !== false,
          status: provider.enabled !== false ? 'active' : 'disabled',
        });
      default:
        return NextResponse.json({
          id: providerKey,
          name: providerKey,
          enabled: provider.enabled !== false,
          status: provider.enabled !== false ? 'active' : 'disabled',
        });
    }
  }

  const cfg = await loadConfig();
  return NextResponse.json(cfg);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const current = await loadConfig();
    const next = {
      providers: body.providers || {},
      priorityOrder: body.priorityOrder || current.priorityOrder,
      bridgeEnabled: body.bridgeEnabled !== false,
      modelOptions: body.modelOptions || current.modelOptions || {},
      favoriteModels: body.favoriteModels || current.favoriteModels || {},
      globalTemperature: body.globalTemperature ?? current.globalTemperature ?? 0.7,
      globalMaxTokens: body.globalMaxTokens ?? current.globalMaxTokens ?? 4000,
      settings: {
        ...(current.settings || {}),
        zed: {
          ...(current.settings?.zed || {}),
          ...(body.settings?.zed || body.zed || {}),
        },
      },
    };

    await saveConfig(next);
    invalidateLlmProviderConfigCache();

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
