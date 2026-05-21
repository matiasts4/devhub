import { NextResponse } from 'next/server';
import { validateCopilotOAuth } from '@/lib/copilot-token';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const { provider, config } = await request.json();

    // Test based on provider type
    let result;
    switch (provider) {
      case 'openrouter':
        result = await testOpenAICompatible(
          'https://openrouter.ai/api/v1',
          (config.OPENROUTER_API_KEY || '').trim(),
          config.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct'
        );
        break;
      case 'opencode':
        result = await testOpenCode(config.OPENCODE_MODEL || 'opencode/gemini-3-flash');
        break;
      case 'zen':
        result = await testOpenAICompatible(
          config.ZEN_BASE_URL || 'https://zen.opencode.ai/v1',
          (config.ZEN_API_KEY || '').trim(),
          config.ZEN_MODEL || 'zen-default'
        );
        break;
      case 'direct':
        if (!config.LLM_BASE_URL) {
          return NextResponse.json({ valid: false, error: 'Base URL requerida' });
        }
        result = await testOpenAICompatible(
          config.LLM_BASE_URL,
          (config.LLM_API_KEY || '').trim(),
          config.LLM_MODEL || 'gpt-4o-mini'
        );
        break;
      case 'copilot':
        result = await testCopilot((config.COPILOT_OAUTH_TOKEN || '').trim());
        break;
      default:
        return NextResponse.json({ valid: false, error: 'Proveedor desconocido' });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 });
  }
}

async function testOpenAICompatible(baseUrl, apiKey, model) {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      return { valid: true };
    }
    const error = await res.json().catch(() => ({}));
    return { valid: false, error: error.error?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

async function testCopilot(oauthToken) {
  if (!oauthToken) {
    return {
      valid: false,
      error: 'No hay token OAuth de Copilot. Hacé login desde Ajustes > GitHub Copilot.',
    };
  }

  const result = await validateCopilotOAuth(oauthToken);
  if (result.valid) {
    return { valid: true };
  }
  return { valid: false, error: result.error };
}

async function testOpenCode(model) {
  try {
    // Just try to get models list as a connectivity test
    await execAsync('opencode models');
    return { valid: true };
  } catch (err) {
    return { valid: false, error: `CLI error: ${err.message}` };
  }
}
