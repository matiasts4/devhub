# Skill Registry

Generated: 2026-03-31
Project: veloce

## Project conventions detected
- Frontend app uses Next.js 15 App Router with React 19 in `src/app`.
- Stack is JavaScript/JSX-first, with TypeScript used for config/tests (`playwright.config.ts`, MCP tests).
- Styling/tooling: Tailwind CSS, PostCSS, ESLint flat config, Prettier, Husky + lint-staged.
- Desktop packaging: Tauri 2 in `src-tauri/`.
- Adjacent services: `devhub-mcp/` (Node ESM + Jest) and `sidecar-backend/` (Express + ws + node-pty).
- No project-root `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, or `copilot-instructions.md` found.

## Testing capabilities
- Root web app test command: `npm run test` → `next test`
- E2E: `npm run test:e2e` → `playwright test`
- Coverage: `devhub-mcp` has `npm run test:coverage` → Jest coverage
- Lint: `npm run lint` / `npm run lint:fix` → ESLint
- Format: `npm run format` → Prettier

## Available skills
| Name | Trigger | Path | Notes |
|------|---------|------|------|
| branch-pr | pull request / prepare changes for review | `~/.config/opencode/skills/branch-pr/SKILL.md` | PR workflow, issue linkage, conventional commits |
| issue-creation | GitHub issue / bug report / feature request | `~/.config/opencode/skills/issue-creation/SKILL.md` | Issue-first workflow with approval gate |
| judgment-day | adversarial review / dual review | `~/.config/opencode/skills/judgment-day/SKILL.md` | Parallel blind review protocol |
| go-testing | Go tests / Bubbletea / teatest | `~/.config/opencode/skills/go-testing/SKILL.md` | Table-driven tests, TUI testing patterns |
| skill-creator | create a new skill | `~/.config/opencode/skills/skill-creator/SKILL.md` | Skill authoring guidance |

## Excluded from registry
- `sdd-*` skills and `_shared` helpers were skipped per registry rules.
- `skill-registry` itself is not included to avoid self-reference.
