import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

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

export async function GET() {
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
    };

    await saveConfig(next);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
