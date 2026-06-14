# Exploration: cursor-morphology

## Current State

DevHub has a working morphology system that decouples chrome geometry from theme colors. Four morphologies already exist (`default`, `brutalist-stage`, `aura`, `switchyard`) and are wired through:

- `src/lib/theme/themes.js` — constants, options, and persistence helpers.
- `src/app/globals.css` — per-morphology CSS variable blocks scoped to `[data-morphology='...']`.
- `src/chrome/morphology.js` — factory functions for panels, buttons, inputs, pills, etc.
- `src/components/ui/chrome-surface.jsx` and `src/components/ui/button.jsx` — primitives that consume the CSS vars.
- `src/app/settings/appearance/page.jsx` — selector UI that lets the user pick the active morphology.

The design context in `.impeccable.md` defines DevHub as **dense, focused, personal**: dark-only, compact, warm amber accent, terminal-first, with Geist UI + JetBrains Mono.

At the same time, the running app uses `HashRouter` from `react-router-dom` (`src/App.js`). The sidebar links to `/project/:id/ajustes`, which renders the legacy `src/views/Ajustes.jsx`. The aspirational/canonical settings pages under `src/app/settings/` (Appearance, LLM Providers, Account, etc.) are Next.js App Router files that are **not currently reachable** through the active router. `UserProfile.jsx` even calls `navigate('/settings/account')`, which would 404 today.

The LLM settings UI (`src/components/settings/LLMProviderSettings.jsx`) embeds a hardcoded `PROVIDER_CONFIGS` registry (`copilot`, `opencode`, `openrouter`, `zen`, `direct`) and a hardcoded `priorityOrder`. The actual runtime config lives in `data/llm-providers-config.json` and is exposed by `src/lib/llmProviderConfig.js` and `/api/settings/llm-providers/*`. These two sources have drifted: e.g., `minimax` exists in the JSON config and backend but not in the frontend registry, while `zen` exists in the frontend but not in the live config.

## Affected Areas

- `src/lib/theme/themes.js` — add `CURSOR` constant + option; no storage format change needed.
- `src/app/globals.css` — add `[data-morphology='cursor']` token block; must coexist with existing morphologies and not regress them.
- `src/chrome/morphology.js` — factories already read CSS vars, but a new morphology may need extra tokens (e.g., smaller control heights, tighter padding, softer shadows, transition curves).
- `src/components/ui/chrome-surface.jsx`, `src/components/ui/button.jsx` — already variable-driven; verify they react to new radius/border/shadow values.
- `src/app/settings/appearance/page.jsx` — add `cursor` to morphology selector and any preview-specific chrome.
- `src/views/Ajustes.jsx` — legacy settings page also has a morphology selector; if it stays alive it needs the same option, or it should be replaced by the canonical page.
- `src/App.js` — route table. Canonicalization of settings requires deciding whether `/settings/*` (Next.js) or `/project/:id/ajustes` (legacy) is the source of truth.
- `src/components/UserProfile.jsx` and `src/components/WorkspaceSidebar.jsx` — navigation targets that currently disagree.
- `src/components/settings/LLMProviderSettings.jsx` + `src/lib/llmProviderConfig.js` + `data/llm-providers-config.json` — frontend registry needs to be derived from or kept in sync with backend config.

## Approaches

### 1. Add `cursor` morphology only (pure chrome addition)

Add the new morphology to the existing system without touching routing or LLM settings.

- **Pros**: Small, isolated, low risk; follows established Switchyard precedent (`openspec/specs/morphology-system/spec.md`); stays within review budget.
- **Cons**: Does not address the settings-route confusion or LLM hardcoding; leaves the user on the legacy `Ajustes.jsx` page.
- **Effort**: Low

### 2. Add `cursor` morphology + canonicalize settings route

Implement the morphology, then make `HashRouter` render the canonical `src/app/settings/appearance/page.jsx` (and related settings pages) at a reachable route, replacing `Ajustes.jsx` for appearance settings.

- **Pros**: Solves the "wrong page active" problem; lets the existing canonical settings pages become real UI; sidebar and UserProfile links can be unified.
- **Cons**: `src/app/settings/layout.jsx` is a Next.js App Router layout using `next/link` and `usePathname`; it cannot be used directly inside `HashRouter`. We would need to either (a) rewrite the layout for react-router, or (b) extract page content into framework-agnostic components. Risk of duplicating settings UI.
- **Effort**: Medium-High

### 3. Add `cursor` morphology + refactor LLM settings to use backend registry

Implement the morphology and replace the hardcoded `PROVIDER_CONFIGS` in `LLMProviderSettings.jsx` with data fetched from `/api/settings/llm-providers` plus `src/lib/llmProviderConfig.js`.

- **Pros**: Fixes the reported hardcoding/misalignment; provider list becomes single-source-of-truth.
- **Cons**: The current UI relies on per-provider metadata (description, icon, field schema) that the JSON config does not store. We must either extend the config schema or keep a thin frontend metadata map keyed by provider name. Larger scope.
- **Effort**: Medium

### 4. Combined: morphology + route canonicalization + LLM registry alignment + reusable skill

The full scope requested by the operator.

- **Pros**: Addresses all three concerns in one coherent change; produces the `devhub-morphology` skill for future agents.
- **Cons**: Cross-cutting; touches routing, chrome tokens, settings UI, and LLM config; review budget risk.
- **Effort**: High

## Recommendation

Proceed with **Approach 4** but split it into deliverable slices:

1. **Slice A — `cursor` morphology**: add constant, CSS block, factory tokens, and selector entries in both `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx`. Keep it additive and regression-tested against existing morphologies.
2. **Slice B — settings route canonicalization**: create a react-router-compatible wrapper that renders the canonical settings pages inside `HashRouter`, redirect `/project/:id/ajustes` to `/project/:id/settings/appearance`, and update `WorkspaceSidebar` + `UserProfile` links. Leave the legacy `Ajustes.jsx` untouched initially; deprecate after verification.
3. **Slice C — LLM settings alignment**: refactor `LLMProviderSettings.jsx` to derive the provider list from `/api/settings/llm-providers` and `llmProviderConfig.js`, keeping only metadata (name, icon, field labels) in a lightweight map. Add missing providers like `minimax`.
4. **Slice D — `devhub-morphology` skill**: write `skills/devhub-morphology/SKILL.md` and symlink/copy to `~/.config/opencode/skills/devhub-morphology/SKILL.md`.

For the `cursor` design direction, treat it as a **warmer, denser Cursor/Copilot**: keep the dark/warm base, but raise panel/control radii, reduce control heights slightly, soften shadows, and add smooth `transition-*` curves. Do not introduce light mode, glassmorphism everywhere, or candy colors — those violate the existing `.impeccable.md` direction.

## Risks

1. **Route schizophrenia**: The app currently ships two routing systems (Next.js App Router files vs. react-router-dom HashRouter). Canonicalizing settings without resolving this will leave dead code and confused navigation. The cleanest fix is a react-router wrapper, not a full migration.
2. **LLM provider drift**: Moving to a backend-driven registry requires the JSON config to carry enough metadata (or the frontend to keep a metadata map). If not scoped carefully, this slice can balloon.
3. **Morphology regression**: Many components compute `calc(var(--chrome-radius-control) - X)` and similar expressions. A new radius value that is too small or too large can break optical alignment across the app. The `cursor` block should include defensive fallbacks and be verified on terminal, kanban, and pizarra surfaces.

## Ready for Proposal

**Yes.** The next step is `sdd-propose` for the combined change, with explicit scope boundaries (slices A-D) and a clear decision that slice A can ship independently if slices B-D are blocked.
