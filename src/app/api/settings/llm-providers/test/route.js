import { NextResponse } from 'next/server';

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
        result = await testCopilot((config.COPILOT_TOKEN || '').trim(), config.COPILOT_MODEL || 'gpt-4o');
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

async function testCopilot(token, model) {
  if (!token || !String(token).trim()) {
    return { valid: false, error: 'Falta COPILOT_TOKEN' };
  }

  // Copilot no acepta PAT clásicos (ghp_...)
  if (String(token).trim().startsWith('ghp_')) {
    return {
      valid: false,
      error:
        'Token clásico detectado (ghp_...). Usa Fine-grained PAT con permiso Copilot Requests.',
    };
  }

  try {
    const res = await fetch('https://api.githubcopilot.com/models', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Editor-Version': 'DevHub/1.0.0',
      },
      body: undefined,
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      const models = Array.isArray(payload?.data)
        ? payload.data.map((m) => m?.id).filter(Boolean)
        : [];

      if (model && models.length > 0 && !models.includes(model)) {
        return {
          valid: true,
          warning: `Credenciales válidas, pero el modelo '${model}' no aparece en los disponibles de Copilot.`,
        };
      }

      return { valid: true };
    }

    const payload = await res.json().catch(() => ({}));
    const message = payload?.error?.message || payload?.message || `HTTP ${res.status}`;
    return { valid: false, error: message };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
