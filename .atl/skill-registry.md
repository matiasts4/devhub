# Agent Teams Lite - Skill Registry

This registry tracks the explicit conventions and triggers used by Antigravity SDD phases and skills.

## Project Standards (Compact Rules)

### Core Stack
- **Web**: Next.js App Router, React, Tailwind CSS.
- **Backend**: Node.js (Express in `sidecar-backend`, MCP in `devhub-mcp`).
- **Desktop**: Tauri (Rust in `src-tauri`).
- **Database**: Supabase (PostgreSQL).

### Conventions
- Use `npm run lint` and `npm run format`.
- E2E testing with Playwright (`npm run test:e2e`). Unit testing with Jest (`devhub-mcp`).
- All persistent memories and architectural decisions MUST go through Engram (`mcp_engram_mem_save`).

## User Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| `judgment-day` | Parallel adversarial review protocol | "judgment day", "review adversarial" |
| `issue-creation` | Issue creation workflow | "create issue", "report bug" |
| `branch-pr` | PR creation workflow | "create pr", "open pr" |
