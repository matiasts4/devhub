import { NextResponse } from 'next/server';
import { resolveZedLlmConfig } from '@/lib/asistente/resolveZedApiKey';

/**
 * Read-only status endpoint for the Zed settings UI: which LLM provider a
 * new Zed chat turn would use right now, and why. Never returns the API
 * key itself — only enough to show/debug provider resolution.
 */
export async function GET() {
  const { provider, source, model, apiKey, authMode } = await resolveZedLlmConfig();
  return NextResponse.json({
    provider,
    source,
    model,
    hasKey: !!apiKey,
    authMode: authMode || null,
  });
}

export const dynamic = 'force-dynamic';
