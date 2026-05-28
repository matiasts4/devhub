## Exploration: ui-professionalization

### Current State

**Stack frontend detectado**
- Next.js 16 App Router wraps a React Router SPA (`src/app/page.js` -> `src/App.js`) inside a Tauri 2 desktop shell.
- UI stack: React 19, Tailwind CSS 4, shadcn/ui, Radix, Sonner, Lucide, Framer Motion, Monaco, xterm.js.
- Legacy CRA residue remains (`src/index.js`, `src/index.css`, `react-scripts` dep), so there are two global CSS entry points.

**Inconsistencias encontradas**
- Headers duplicated: global `PageHeader`, page-local sticky headers in Dashboard/Proyectos/Roadmap/Historial/Conexiones/Scaffolding/TelegramMonitor/Ajustes/CodeEditor, plus special shells (`SessionHeader`, `ControlRoomHeader`).
- Header styling varies: `core-sticky-header`, ad hoc `bg-surface-app/95`, `backdrop-blur-sm`, dark gradients, and different title sizes (`text-base`, `text-lg`, `text-3xl`).
- Typography split: body uses `Geist` in `src/app/globals.css`, Tailwind `fontFamily.sans` is `Inter`, mono uses `JetBrains Mono`, and some editors/terminal views hardcode `Consolas`.
- Font sizes are heavily hardcoded with many `text-[10px]/[11px]/[12px]`, inline `fontSize: 13`, and arbitrary spacing/letter-spacing values.
- Appearance settings exist in two places: legacy `src/views/Ajustes.jsx` + `src/views/settings/AppearanceSection.jsx`, and App Router `src/app/settings/appearance/page.jsx`.
- `next-themes` is installed but no `ThemeProvider` is wired; the active theme system is custom via `data-theme` + CSS vars.
- Some screens are still monolithic / overlong rather than composed from reusable page sections.

**Settings / apariencia**
- `src/lib/theme/themes.js` owns `devhub:theme` and `devhub:zoom`, applies `data-theme` and `--app-zoom`, and supports Ctrl+/Ctrl-/Ctrl0.
- Theme presets: deep-sea, nord, dracula, light, catppuccin, tokyo-night, monokai, synthwave.
- There is terminal renderer preference storage too (`devhub_terminal_renderer_default_mode`), so appearance is partly centralized but not single-sourced.

**Terax AI learnings**
- Stack: Tauri 2, Rust, React 19, TypeScript, xterm.js, CodeMirror 6, Vercel AI SDK v6, Tailwind v4, shadcn/ui, Zustand.
- Relevant ideas: terminal-first shell, native PTY, WebGL terminal, separate editor theme vs app theme, in-app custom themes/backgrounds, focused Settings/AI panels, keychain-backed secrets.
- Useful for DevHub: central settings surface, explicit customization model, and lighter chrome around terminal/editor workspaces.

### Affected Areas
- `src/App.js` — workspace shell, global header insertion, theme/zoom init.
- `src/components/PageHeader.jsx` — main global header, currently bespoke and style-heavy.
- `src/components/chat/SessionHeader.jsx` — chat header pattern.
- `src/components/control-room/ControlRoomHeader.jsx` — swarm/control header pattern.
- `src/views/Dashboard.jsx`, `Proyectos.jsx`, `ProjectHub.jsx`, `Roadmap.jsx`, `Historial.jsx`, `Conexiones.jsx`, `Scaffolding.jsx`, `TelegramMonitor.jsx`, `CodeEditor.jsx`, `Ajustes.jsx` — page-specific headers / shells.
- `src/app/settings/layout.jsx`, `src/app/settings/appearance/page.jsx` — App Router settings shell.
- `src/views/settings/AppearanceSection.jsx`, `PrefsSection.jsx`, `ProjectSection.jsx` — legacy settings blocks.
- `src/app/globals.css`, `src/index.css`, `src/App.css`, `tailwind.config.js`, `src/lib/theme/themes.js` — global styling/token sources.
- `src/components/workspace/FileExplorerEditorPane.jsx`, `src/components/TerminalTTY.jsx` — hardcoded font and size outliers.
- `src/components/ui/sonner.jsx` — next-themes wrapper not wired into app shell.

### Approaches

1. **Central shell + tokenized typography** — build one shared app shell/header system and move page titles, breadcrumbs, and actions into reusable slots; consolidate font, size, spacing, and surface tokens.
   - Pros: biggest consistency win, easiest to reason about, matches VS Code / settings-panel feel.
   - Cons: touches many screens.
   - Effort: Medium/High.

2. **Incremental page normalization** — keep current shells, but extract shared header primitives and migrate pages one by one.
   - Pros: lower risk, smaller PRs.
   - Cons: duplicate patterns survive longer.
   - Effort: Medium.

### Recommendation
Start with **central shell + tokenized typography** in a narrow proposal: one shared page header/surface system, one appearance source of truth, and one font scale. Then migrate the worst offenders (ProjectHub, Dashboard, Proyectos, Roadmap, Settings) before touching secondary panels.

### Risks
- Mixed Next.js + React Router + Tauri architecture can break if shell assumptions are made too broadly.
- Dual global CSS entry points (`src/app/globals.css` and `src/index.css`) can drift.
- Refactor scope can balloon if you try to restyle every page at once.
- `next-themes` is not currently the real theme source, so don’t build the proposal around it.

### Ready for Proposal
Yes. The proposal should focus on shell unification, appearance settings consolidation, and typography/token cleanup first; then secondary page migration.
