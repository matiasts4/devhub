# SDD: Terminal Subscription Quota Status Bar (`QuotaHeaderBadge`)

## 🎯 Scope & Objectives

The goal of this implementation is to provide real-time visibility into remaining AI subscription quotas (such as Grok, Claude Code, AGY/Antigravity, Kimi Code, OpenCode, and Codex) directly within the DevHub workspace header above the active terminals.

### Key Capabilities

1. **Dynamic Active Session Sensing**: Automatically detects which AI CLI tool or engine is running in the currently focused terminal tab (`grok`, `claude`, `agy`, `kimi`, `opencode`, `codex`).
2. **Real-time Quota Engine**: Background provider engine that queries local credentials, rate-limit headers, and vendor usage endpoints to calculate utilization percentages and reset windows.
3. **Header Badge Component**: A compact, responsive badge embedded in the terminal workspace header.
4. **Detailed Quota Inspector**: Clickable popover displaying burn rates, request counts, 5-hour/7-day windows, and reset countdown timers.

---

## 🏗️ Architecture Blueprint

```
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │                            DevHub Terminal Workspace                             │
 ├─────────────────────────────────────────────────────────────────────────────────┤
 │ [Header] Active Tab: Grok CLI   │ 🟢 GROK: 68% Quota (Resets in 1h 24m) [Inspector]│
 ├─────────────────────────────────────────────────────────────────────────────────┤
 │ $ grok agent run "Build feature"                                               │
 │ ...                                                                             │
 └─────────────────────────────────────────────────────────────────────────────────┘
```

### Module Breakdown

```
src/
├── lib/
│   └── quota/
│       ├── types.js                  # Data structures for quotas & snapshots
│       ├── quotaManager.js            # Polling, caching, and event emitter
│       ├── activeSessionSensor.js    # Detects active AI tool per terminal tab
│       └── providers/
│           ├── anthropic.js          # Claude Code (5h & 7d window usage)
│           ├── antigravity.js        # AGY local proxy & model limits
│           ├── grok.js               # Grok (xAI) auth & credits tracking
│           ├── kimi.js               # Kimi / Moonshot API balance & rate limit
│           ├── codex.js              # OpenAI Codex rate limits
│           └── opencode.js           # OpenCode session usage
└── components/
    └── quota/
        ├── QuotaHeaderBadge.jsx      # Compact pill badge for workspace header
        ├── QuotaProgressRing.jsx     # Visual SVG gauge ring
        └── QuotaInspectorPopover.jsx # Extended stats popover
```

---

## 📊 Provider Measurement Specifications

| Provider              | Data Source & Mechanism                                                | Key Metrics                                  |
| :-------------------- | :--------------------------------------------------------------------- | :------------------------------------------- |
| **Claude Code**       | `~/.claude/` credentials + `https://api.anthropic.com/api/oauth/usage` | `five_hour` %, `seven_day` %, `resets_at`    |
| **Antigravity (AGY)** | Local process port detection (`127.0.0.1:<port>/v1/quota`)             | Per-model `remaining_fraction`, `reset_time` |
| **Grok (xAI)**        | `~/.grok/auth.json` bearer token + Grok usage probes                   | Remaining credits %, renewal timestamp       |
| **Kimi Code**         | `~/.kimi/config.json` + `https://api.moonshot.cn/v1/users/me/balance`  | Balance, RPM/TPM remaining                   |
| **Codex / OpenAI**    | `~/.codex/credentials.json` + Rate limit headers                       | `x-ratelimit-remaining-tokens`, `requests`   |
| **OpenCode**          | Local state / proxy rate limit interceptor                             | Token usage %, quota status                  |

---

## 🗓️ Implementation Phases

- [ ] **Phase 1: Quota Core Engine**
  - Implement `src/lib/quota/types.js`
  - Implement `src/lib/quota/quotaManager.js`
  - Implement initial adapters: `grok.js`, `anthropic.js`, `antigravity.js`

- [ ] **Phase 2: Terminal Session Sensor**
  - Connect active terminal tab state from `ttyServer` / terminal workspace tabs to `activeSessionSensor.js`.

- [ ] **Phase 3: Header Badge UI Component**
  - Implement `QuotaHeaderBadge.jsx` and `QuotaProgressRing.jsx`.
  - Embed into the Terminal workspace header (`PizarraPane` / workspace top bar).

- [ ] **Phase 4: Detailed Quota Inspector Popover**
  - Implement `QuotaInspectorPopover.jsx` showing burn rate, reset timer, and multi-model breakdown.

- [ ] **Phase 5: Additional Adapters & Tests**
  - Implement `kimi.js`, `codex.js`, `opencode.js`.
  - Unit tests for parsers, manager caching, and UI rendering.
