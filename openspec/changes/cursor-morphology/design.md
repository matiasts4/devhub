# Design: cursor-morphology

## Technical Approach

Add `cursor` as a fifth morphology that uses the existing CSS-variable axis (`data-morphology`). No new factory is required: `src/chrome/morphology.js`, `chrome-surface.jsx`, and `button.jsx` already resolve geometry from `--chrome-*` tokens. The change is split into four independent slices so Slice A can ship alone.

| Slice | Scope                                                       | Risk   |
| ----- | ----------------------------------------------------------- | ------ |
| A     | `cursor` tokens + registry + selectors                      | Low    |
| B     | HashRouter settings wrapper + redirect + nav links          | Medium |
| C     | Backend-driven LLM provider list with frontend metadata map | Medium |
| D     | `devhub-morphology` skill                                   | Low    |

## Architecture Decisions

| Decision                     | Choice                                                                                        | Rationale                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Morphology variable model    | Reuse `[data-morphology='cursor']` token block                                                | Follows `default`, `brutalist-stage`, `aura`, `switchyard` precedent; factories read vars automatically.                              |
| Accent override              | Set `--accent-primary: oklch(0.74 0.16 57)` inside cursor block                               | Gives the warm amber Cursor/Copilot feel without adding a new accent axis.                                                            |
| Settings routing             | Create `SettingsLayoutRouter` that wraps canonical pages in `HashRouter`                      | Next.js App Router files under `src/app/settings/` are unreachable today; copying the layout to react-router avoids a full migration. |
| LLM registry source of truth | Backend `/api/settings/llm-providers` returns provider keys; frontend keeps only metadata map | `data/llm-providers-config.json` already owns values; this removes drift.                                                             |
| Unknown providers            | Generic key/value UI fallback                                                                 | Prevents crashes when backend adds providers faster than frontend metadata.                                                           |
| Legacy `Ajustes.jsx`         | Keep, redirect `/project/:id/ajustes`                                                         | Backward compatible; remove after verification.                                                                                       |

## Cursor Tokens

Add this block to `src/app/globals.css` after the existing morphology blocks:

```css
[data-morphology='cursor'] {
  --chrome-radius-panel: 18px;
  --chrome-radius-control: 8px;
  --chrome-border-width: 1px;
  --chrome-border-color: color-mix(in srgb, var(--accent-primary) 22%, var(--border-subtle));
  --chrome-shadow-panel: 0 14px 28px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.03);
  --chrome-shadow-control: 0 4px 12px rgba(0, 0, 0, 0.18);
  --chrome-panel-fill: color-mix(in srgb, var(--surface-card) 96%, var(--accent-primary) 4%);
  --chrome-panel-fill-emphasis: color-mix(
    in srgb,
    var(--surface-elevated) 94%,
    var(--accent-primary) 6%
  );
  --chrome-control-fill: color-mix(in srgb, var(--surface-card) 90%, transparent);
  --chrome-control-fill-hover: color-mix(in srgb, var(--surface-elevated) 92%, transparent);
  --chrome-press-offset: 0px;
  --accent-primary: oklch(0.74 0.16 57);
  --accent-glow: rgba(227, 179, 65, 0.16);
}
```

No existing morphology values are changed.

## Data Flow

```
User selects cursor ──► setMorphology('cursor') ──► html[data-morphology='cursor']
                                                          │
Factories / ChromeSurface / Button ◄── CSS var resolution ◄┘

Settings navigation ──► HashRouter ──► SettingsLayoutRouter ──► canonical page
Legacy /project/:id/ajustes ──► Navigate to /project/:id/settings/appearance

LLM page ──► GET /api/settings/llm-providers ──► provider keys + persisted values
                │
                ▼
        PROVIDER_META (name, icon, schema)
                │
                ▼
        ProviderCard renders fields; POST changes back
```

## File Changes

| File                                                   | Action       | Description                                                                                  |
| ------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------- |
| `src/lib/theme/themes.js`                              | Modify       | Add `CURSOR: 'cursor'` to `MORPHOLOGIES` and `MORPHOLOGY_OPTIONS`.                           |
| `src/app/globals.css`                                  | Modify       | Add `[data-morphology='cursor']` token block.                                                |
| `src/app/settings/appearance/page.jsx`                 | Modify       | Add cursor option to morphology selector.                                                    |
| `src/views/Ajustes.jsx`                                | Modify       | Add cursor option to legacy selector.                                                        |
| `src/App.js`                                           | Modify       | Add `/project/:projectId/settings/*` routes and `/ajustes` redirect.                         |
| `src/components/settings/SettingsLayoutRouter.jsx`     | Create       | react-router clone of `src/app/settings/layout.jsx` using `Link`/`useLocation`.              |
| `src/components/WorkspaceSidebar.jsx`                  | Modify       | Point "Ajustes" link to `/project/:id/settings/appearance`; active state covers `/settings`. |
| `src/components/UserProfile.jsx`                       | Modify       | Navigate to `/project/:projectId/settings/account`.                                          |
| `src/components/settings/LLMProviderSettings.jsx`      | Modify       | Backend-driven provider list; add `PROVIDER_META` fallback; extract `ProviderCard`.          |
| `src/components/settings/ProviderCard.jsx`             | Create       | Render one provider card from metadata + live config.                                        |
| `src/lib/llmProviderConfig.js`                         | Modify       | Add helper to expose env-var schema hints if backend stores them (optional).                 |
| `skills/devhub-morphology/SKILL.md`                    | Create       | Reusable agent skill for morphology extensions.                                              |
| `~/.config/opencode/skills/devhub-morphology/SKILL.md` | Symlink/Copy | Make skill discoverable by OpenCode.                                                         |

## Interfaces / Contracts

```js
// themes.js
export const MORPHOLOGIES = {
  DEFAULT: 'default',
  BRUTALIST_STAGE: 'brutalist-stage',
  AURA: 'aura',
  SWITCHYARD: 'switchyard',
  CURSOR: 'cursor',
};

// LLMProviderSettings.jsx — lightweight metadata map
const PROVIDER_META = {
  copilot: { name: 'GitHub Copilot', icon: Shield, schema: { ... } },
  opencode: { name: 'OpenCode Platform', icon: Terminal, schema: { ... } },
  openrouter: { name: 'OpenRouter', icon: Globe, schema: { ... } },
  minimax: { name: 'MiniMax', icon: Cpu, schema: { ... } },
  direct: { name: 'API Directa', icon: Plug, schema: { ... } },
};

// Generic fallback schema for unknown providers
function deriveSchemaForUnknown(key, value) {
  if (key.endsWith('_API_KEY')) return { label: key, type: 'password' };
  if (key.endsWith('_BASE_URL')) return { label: key, type: 'url' };
  if (key.endsWith('_MODEL')) return { label: key, type: 'select', options: [] };
  return { label: key, type: 'text' };
}
```

## Testing Strategy

| Layer       | What                                                                                                         | How                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Unit        | `normalizeMorphology('cursor')` returns cursor; fallback works                                               | Extend `src/lib/theme/__tests__/themes.test.js`.                               |
| Unit        | Cursor tokens resolve to expected values                                                                     | JSDOM computed-style check on `[data-morphology='cursor']`.                    |
| Integration | Appearance page shows cursor option and calls `setMorphology('cursor')`                                      | Extend `page.test.jsx`.                                                        |
| Integration | LLM settings renders unknown provider without crashing                                                       | Extend `LLMProviderSettings.test.jsx` with `minimax` and a synthetic provider. |
| E2E         | `/project/:id/settings/appearance` reachable; `/ajustes` redirects; existing morphologies render identically | Playwright smoke spec.                                                         |

## Migration / Rollout

1. **Morphology**: existing stored values unknown to the reverted registry fall back to `default` automatically via `normalizeMorphology`.
2. **Routes**: `/project/:id/ajustes` redirects to `/project/:id/settings/appearance`; sidebar/UserProfile links updated simultaneously.
3. **LLM**: hardcoded frontend registry is replaced; backend `data/llm-providers-config.json` remains the source of truth. Providers removed from backend disappear from UI; new providers appear with generic UI.
4. **Rollback**: revert the five file groups listed in the proposal; remove new files; restore `Ajustes.jsx` as the active route if needed.

## Open Questions

- Should `SettingsLayoutRouter` render the full Next.js-style `UiShell`, or only the sidebar + header chrome? The mock in `layout.jsx` shows workspace chrome that may conflict with `WorkspaceLayout`.
- Should the backend expose per-provider field metadata so the frontend map can shrink further?
- Should `cursor` define a warm body background gradient, or rely on the active theme's `--surface-app`?
