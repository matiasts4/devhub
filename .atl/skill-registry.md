# Skill Registry

**Delegator use only.** Sub-agents should receive pre-resolved compact rules; they do not read this file directly.

## User Skills

| Trigger | Skill | Path |
|---|---|---|
| React/Next.js testing, Testing Library, Vitest, Playwright | frontend-testing | /home/matias/.config/opencode/skills/frontend-testing/SKILL.md |
| ReactJS/NextJS/TypeScript/Tailwind UI work | senior-frontend | /home/matias/.config/opencode/skills/senior-frontend/SKILL.md |
| React/Next.js performance optimization | react-best-practices | /home/matias/.config/opencode/skills/react-best-practices/SKILL.md |
| UI/UX design, layouts, component polish | ui-ux-pro-max | /home/matias/.config/opencode/skills/ui-ux-pro-max/SKILL.md |
| GitHub PR creation / review workflow | branch-pr | /home/matias/.config/opencode/skills/branch-pr/SKILL.md |
| GitHub issue creation / bug reports | issue-creation | /home/matias/.config/opencode/skills/issue-creation/SKILL.md |
| DevHub sync / worker protocol | sdd-devhub-sync | /home/matias/.config/opencode/skills/sdd-devhub-sync/SKILL.md |

## Compact Rules

### frontend-testing
- Prefer Testing Library for component/integration tests.
- Use Vitest/Jest patterns appropriate to the stack.
- Use Playwright for E2E and visual regression when UI behavior matters.

### senior-frontend
- Optimize for composition, clarity, and maintainability first.
- Use framework-native patterns before custom abstractions.
- Respect performance, accessibility, and bundle impact.

### react-best-practices
- Avoid unnecessary client-side work and waterfalls.
- Prefer server/data fetching patterns that reduce re-render churn.
- Keep component boundaries clean and memoization intentional.

### ui-ux-pro-max
- Design for responsiveness, accessibility, and visual hierarchy.
- Polish spacing, typography, motion, and state feedback.
- Match the existing stack and component system.

### branch-pr
- Prepare PRs with a clear summary, scope, and verification notes.
- Check branch state before creating/updating PRs.
- Use gh for GitHub operations.

### issue-creation
- Create issues with problem statement, impact, and acceptance criteria.
- Include reproduction/expected behavior when reporting bugs.
- Keep titles concise and actionable.

### sdd-devhub-sync
- OpenCode is the canonical source; mirror edits to every IDE skill copy.
- Check the project's documentation policy before planning or docops work.
- Preserve shared/legacy docs, archive legacy docs first for archive-only projects, and ask when policy is missing or ambiguous.
- Keep the worker contract: `get_next_task`, `add_task_comment`, `update_task`, `create_task`, and `update_agent_status`.

## Project Conventions

| File | Path | Notes |
|---|---|---|
| `.gitignore` | `/home/matias/devhub/.gitignore` | Ignores Next, Tauri, MCP, Playwright artifacts; now also ignores `.atl/`. |
| `openspec/config.yaml` | `/home/matias/devhub/openspec/config.yaml` | Existing SDD config; `strict_tdd: true`; do not overwrite without intent. |
| `README.md` | `/home/matias/devhub/README.md` | Documents DevHub as Next.js + Supabase + MCP + swarm-control workspace. |
| `eslint.config.js` | `/home/matias/devhub/eslint.config.js` | ESLint flat config with React Hooks rules and warnings for console/unused vars. |
| `jsconfig.json` | `/home/matias/devhub/jsconfig.json` | Defines `@/* -> ./src/*` alias. |
| `package.json` | `/home/matias/devhub/package.json` | Root app scripts for dev/build/lint/test/e2e; package manager metadata says yarn. |
| `devhub-mcp/package.json` | `/home/matias/devhub/devhub-mcp/package.json` | Separate Node ESM/Jest package for MCP server and coverage. |
| `src-tauri/Cargo.toml` | `/home/matias/devhub/src-tauri/Cargo.toml` | Tauri 2 Rust desktop shell. |
