# SDD: Terminal Subscription Quota Status Bar (`QuotaHeaderBadge`)

> **v2 (2026-07-19)** — Revisión completa tras auditar la implementación inicial:
> se eliminaron **todos los porcentajes inventados** (fallbacks hardcodeados del
> 10–25 %), se implementó **Kimi Code real** (OAuth + endpoint `/usages`, verificado
> en vivo), se reescribieron **Codex** y **Antigravity** con los mismos mecanismos
> que usa [onWatch](https://github.com/onllm-dev/onwatch), y se añadió **Z.ai**.
> Regla de oro v2: **ningún adaptador fabrica datos** — si no hay cuota real,
> muestra `--` y un error explicativo.

## 🎯 Scope & Objectives

Real-time visibility into remaining AI subscription quotas (Kimi Code, Grok, Claude Code, AGY/Antigravity, OpenCode, Codex, Z.ai) directly within the DevHub workspace header above the active terminals.

### Key Capabilities

1. **Dynamic Active Session Sensing**: detects which AI CLI runs in the focused terminal tab (`kimi`, `grok`, `claude`, `agy`, `opencode`, `codex`, `z.ai`).
2. **Real Quota Engine**: server adapters query local credentials + vendor usage endpoints. No fabricated numbers — honest `error` states when data is unavailable.
3. **Header Badge Component**: compact pill in the terminal workspace header; renders `--` (dimmed ring) when the provider has no real data.
4. **Detailed Quota Inspector**: popover with per-window breakdown, reset countdowns, plan/membership metadata and credits/Extra-Usage balances.

---

## 🏗️ Architecture Blueprint

```
src/
├── lib/
│   └── quota/
│       ├── types.js                  # PROVIDERS enum + labels (7 providers)
│       ├── quotaManager.js           # Client: polling (45s), cache, pub-sub
│       ├── activeSessionSensor.js    # Tab title → provider detection
│       ├── providers/                # Client-side proxies → /api/quota?provider=
│       └── server/                   # Server adapters (Node, credentials + HTTP)
│           ├── kimi.js               # ✅ REAL: OAuth refresh + api.kimi.com/coding/v1/usages
│           ├── anthropic.js          # ✅ REAL: ~/.claude/.credentials.json + /api/oauth/usage
│           ├── codex.js              # ✅ REAL: ~/.codex/auth.json + chatgpt.com/backend-api/wham/usage
│           ├── antigravity.js        # ✅ REAL: language_server Connect RPC probe (onWatch method)
│           ├── grok.js               # ⚠️ credentials + probe; honest error if no quota data
│           ├── opencode.js           # ℹ️ detection only (no own quota; proxies upstreams)
│           └── zai.js                # ✅ REAL: ZAI_API_KEY + api.z.ai/api/monitor/usage/quota/limit
├── app/api/quota/route.js            # GET /api/quota[?provider=] — runs adapters in parallel
└── components/quota/
    ├── QuotaHeaderBadge.jsx          # Pill badge; `--` when no real data
    ├── QuotaProgressRing.jsx         # SVG gauge (dimmed state supported)
    └── QuotaInspectorPopover.jsx     # Windows, resets, metadata chips, errors
```

---

## 📊 Provider Measurement Specifications (verified)

| Provider          | Credentials                                                                    | Endpoint / Mechanism                                                                                          | Metrics                                                        |
| :---------------- | :----------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------- |
| **Kimi Code**     | `~/.kimi-code/credentials/kimi-code.json` (OAuth, legacy `~/.kimi/…`)          | `GET https://api.kimi.com/coding/v1/usages` (Bearer). Refresh: `POST https://auth.kimi.com/api/oauth/token` (client_id del CLI oficial). Fallback: Moonshot balance con `KIMI_API_KEY` | Weekly limit, 5h rolling limit, Extra-Usage (booster) wallet, membership tier |
| **Claude Code**   | `~/.claude/.credentials.json` → `claudeAiOauth.accessToken`                    | `GET https://api.anthropic.com/api/oauth/usage`                                                               | `five_hour`, `seven_day`, `seven_day_sonnet`, monthly, extra   |
| **Codex**         | `~/.codex/auth.json` → `tokens.access_token` (+ `account_id` header)           | `GET https://chatgpt.com/backend-api/wham/usage` (fallback path `/api/codex/usage`)                           | 5h + weekly windows (`used_percent`, `reset_at`), credits, plan |
| **Antigravity**   | Proceso `language_server` local (`--csrf_token` en cmdline)                    | Connect RPC `POST /exa.language_server_pb.LanguageServerService/GetUserStatus` en `127.0.0.1:<puerto>` (HTTPS self-signed → HTTP) | Per-model `remainingFraction` + `resetTime`, plan, prompt credits |
| **Grok (xAI)**    | `~/.grok/auth.json` bearer                                                     | Probe `api.x.ai/v1/user/usage`; si no hay datos → error honesto (sin inventar)                                | Credits %, reset                                                |
| **Z.ai (GLM)**    | `ZAI_API_KEY` env                                                              | `GET https://api.z.ai/api/monitor/usage/quota/limit` (raw key, no Bearer)                                     | `TIME_LIMIT`, `TOKENS_LIMIT`, `nextResetTime`                   |
| **OpenCode**      | `~/.config/opencode/opencode.json`                                             | Sin cuota propia — reporta estado de instalación y delega en upstreams                                        | —                                                              |

### Kimi Code — descubrimiento clave

La doc oficial no publica API de cuota, pero el CLI la implementa (`/usage`).
Extraído del binario oficial (`packages/oauth/src/managed-usage.ts`):

- Base URL: `process.env.KIMI_CODE_BASE_URL ?? https://api.kimi.com/coding/v1` → `GET {base}/usages`.
- OAuth host: `KIMI_CODE_OAUTH_HOST ?? https://auth.kimi.com` → `POST /api/oauth/token`
  con `client_id=17e5f671-d194-4dfb-9706-5516cb48c098`, `grant_type=refresh_token`.
- `expires_at` en credenciales = **epoch seconds**; el token es de corta duración (~10 min),
  por lo que el adaptador refresca y **persiste** el token nuevo automáticamente.
- Payload real (verificado 2026-07-19): `usage` (weekly, strings `limit/used/remaining` + `resetTime`),
  `limits[]` (ventanas con `window.duration/timeUnit`, p.ej. 300×MINUTE = 5h), `boosterWallet`
  (Extra Usage, fixed-point 1e6 cents), `user.membership.level`, `parallel.limit`.

---

## 🗓️ Implementation Phases

- [x] **Phase 1: Quota Core Engine** — types, quotaManager, API route.
- [x] **Phase 2: Terminal Session Sensor** — `activeSessionSensor.js` (7 providers).
- [x] **Phase 3: Header Badge UI** — badge + ring embebidos en `WorkspaceRenderAssembly.jsx`.
- [x] **Phase 4: Detailed Quota Inspector Popover** — ventanas, resets, metadata.
- [x] **Phase 5: Real adapters & honesty pass (v2)**
  - ✅ Kimi real (OAuth + `/usages`, probado contra la API en vivo: weekly + 5h + membership).
  - ✅ Codex real (`wham/usage` de ChatGPT backend).
  - ✅ Antigravity real (probe Connect RPC del language server, método onWatch).
  - ✅ Claude: detección de credenciales corregida (`~/.claude/.credentials.json`).
  - ✅ Eliminados fallbacks inventados en grok/antigravity/opencode/codex/kimi.
  - ✅ Nuevo proveedor: **Z.ai** (endpoint documentado por onWatch).
  - ✅ UI: estados "sin datos" (`--`, ring apagado, tooltip con el error).
  - ✅ Tests: 19/19 (`src/lib/quota/__tests__/`), parsers puros exportados por adaptador.

## ⚙️ Preferencias de usuario (v3, 2026-07-19)

- **`src/lib/quota/quotaPreferences.js`** — persistencia localStorage (`devhub-quota-preferences`)
  + `CustomEvent`, patrón idéntico a `zedOverlaySettings.js`:
  - `providerOrder: string[]` — proveedores **habilitados y en orden** (los ausentes están off).
  - `defaultProvider: string|null` — proveedor fijado (★); `null` = auto-detección por sesión.
- **UI**: sección **"Cuotas"** en `TerminalRestoreSettingsModal` (el hub de configuración
  dentro de la página de terminales, botón ⚙ del top-bar) vía
  `src/components/quota/QuotaProviderSettings.jsx`: listado de los 7 proveedores con
  switch por fila, reorden ↑/↓ y pin de default. Sin dependencias de DnD.
- **Sincronización filtrada**: `quotaManager.fetchAll()` pide solo los habilitados
  (`GET /api/quota?providers=a,b,c` — la route acepta el subconjunto), reacciona al
  evento de cambio de prefs y purga del caché los deshabilitados. **Cero polling a
  proveedores apagados** (ej. Z.ai sin `ZAI_API_KEY`).
- **Badge/popover**: el badge respeta pin → detección → primer habilitado
  (`resolveBadgeProvider`), se oculta si no hay ninguno habilitado; el popover lista
  solo habilitados en el orden configurado.
- **Iconos nativos**: emojis sustituidos por lucide-react (`Hourglass`, `RefreshCw`,
  `X`, `TriangleAlert`, `Gauge`, `Star`, `ChevronUp/Down`) en badge, popover y modal
  (incluido el ⚙ del header del hub de settings).

## 🗄️ Caché con TTL persistente (v4, 2026-07-19)

- **`src/lib/quota/server/quotaCache.js`** — caché servidor con TTL (default 60 s,
  env `QUOTA_CACHE_TTL_MS`) + persistencia en disco (`data/quota-cache.json`,
  env `QUOTA_CACHE_FILE`, gitignored). Espejo en memoria hidratado desde disco al
  arrancar el proceso.
- **Comportamiento**:
  - Petición dentro del TTL → se sirve la entrada cacheada (`servedFromCache: true`)
    **sin tocar las APIs de vendors** (Kimi `/usages`, probe AGY con PowerShell+netstat, etc.).
  - Reinicio de la app dentro del TTL → se rehidrata desde disco; no se recalcula nada.
  - TTL expirado → refetch en vivo y reescritura (memoria + disco, escritura debounced 500 ms).
  - Fallo en vivo con entrada expirada → fallback al valor *stale* (`stale: true`).
  - `?force=1` → bypass total (botón refresh del popover; `quotaManager.fetchAll(true)`).
- Antes de esto, cada poll de 45 s y cada reinicio re-ejecutaban los 7 adaptadores
  contra los endpoints en vivo.
- Tests: 33/33 (TTL, expiración, stale fallback, hidratación desde disco, archivo
  corrupto). Verificado E2E: 2ª llamada `servedFromCache: true`; tras matar y
  reiniciar el servidor sigue sirviendo desde disco; `force=1` trae datos nuevos.
- Tests: 46/46 verdes (quota + prefs + modal + keyboard). Verificado E2E con Chromium
  headless: sección visible, toggles/reorden/pin persisten, badge muestra el proveedor
  fijado con datos reales (Kimi Code 59 %, reset 3h 45m), API solo consulta habilitados.

## 🔭 Futuras mejoras (candidatas, investigadas vía onWatch)

- **GitHub Copilot**: PAT con scope `copilot` → API interna (interactions/chat/completions, reset mensual). Beta/no documentado.
- **Gemini CLI**: OAuth Google, cuota por modelo con reset de 24 h.
- **MiniMax Coding Plan**: API key, pool compartido con ventana rolling de 5 h.
- **Cursor**: credenciales auto-detectadas del desktop (SQLite/Keychain).
- **OpenRouter**: `GET /api/v1/auth/key` → créditos restantes.
- **Grok gRPC-web**: probe `grok.com` para SuperGrok real (hoy solo hay best-effort).
- **Histórico/proyecciones**: snapshots en SQLite + burn-rate como onWatch (fuera de scope del badge).

## ✅ Verificación (2026-07-19)

- `GET /api/quota?provider=kimi` en vivo → weekly 4 %, 5h 18 %, membership INTERMEDIATE (datos reales).
- `GET /api/quota` (todos) → adaptadores sin credenciales devuelven errores honestos, sin números falsos.
- `jest src/lib/quota` → 19/19 verde. `eslint` sobre archivos tocados → 0 errores.
