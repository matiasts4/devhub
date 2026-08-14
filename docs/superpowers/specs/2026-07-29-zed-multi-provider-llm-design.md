# Zed Assistant — Multi-Provider LLM Connection (Kimi Code API key + Grok)

Date: 2026-07-29
Status: Approved
Approach: A — fix and complete the existing integration (no rewrite)

## Goal

Make the Zed assistant's multi-provider LLM connection work end-to-end for
**Grok (xAI)** and **Kimi Code (API key)**, with provider selection in the
existing settings panel and **strict** resolution (no automatic fallback).

Out of scope: assistant behavior improvements (prompt/tools/UX), Kimi Code
subscription OAuth, generic provider registry refactor.

## Current state

- `resolveZedApiKey.js` already resolves `xai | kimi_code | minimax` and is
  already strict when `settings.zed.provider` (or `ZED_LLM_PROVIDER`) is set —
  it uses that provider exclusively. The xai→kimi→minimax fallback only runs
  when no provider is chosen.
- `grokClient.js` already accepts a `baseUrl`, so it serves both xAI and Kimi
  Code with no changes.
- Kimi Code API-key path is already wired (`KIMI_CODE_API_KEY`,
  base URL `https://api.kimi.com/coding/v1/chat/completions`).

Gaps:
- `api/settings/llm-providers/test/route.js` has no `xai`/`kimi_code` case
  ("Probar conexión" returns "Proveedor desconocido").
- `api/settings/llm-providers/models/route.js` has no `xai`/`kimi_code` case.
- `ZedModelSettings.jsx` labels Kimi Code "suscripción" but it is API-key only.

## Changes

1. `test/route.js` — add `xai` and `kimi_code` cases via `testOpenAICompatible()`
   with correct base URLs. For xAI resolve credentials with `resolveXaiCredentials()`
   (supports API key + SuperGrok OAuth).
2. `models/route.js` — add `xai` and `kimi_code` cases in `getProviderRequest()`
   pointing at their `/models` endpoints.
3. `ZedModelSettings.jsx` — fix Kimi Code panel wording (API key), ensure save
   persists `KIMI_CODE_API_KEY`/`KIMI_CODE_MODEL`, and that test/models work.
4. Chat route / resolution — verify strict behavior; return a clear error when
   the chosen provider has no credentials (no fallback).

## Base URLs

- xAI: chat `https://api.x.ai/v1/chat/completions`, models `https://api.x.ai/v1/models`
- Kimi Code: chat `https://api.kimi.com/coding/v1/chat/completions`,
  models `https://api.kimi.com/coding/v1/models`

## Error handling

- Chosen provider without credentials → chat route returns explicit message, no fallback.
- `test/route.js`: 10s timeout, maps errors to `{valid:false, error}`.
- `models/route.js`: on failure returns `{models:[], error}` with status 200.
- xAI OAuth expired → refresh + persist; fall back to API key if present.

## Testing

- Unit: `xai`/`kimi_code` cases in test/models routes (mock fetch).
- Unit: `resolveZedLlmConfig()` strict — `provider='kimi_code'` with no key
  returns `apiKey:null` (does not fall to xai/minimax).
- Manual golden path: save Kimi key → test OK → list models → select Kimi →
  send assistant message → response.
- Manual edge: select Kimi with no key → clear error in assistant.
