# Spec: zed-chat-ux (delta)

> FRs: Z06, Z07, Z08. No baseline spec — all ADDED.

## ADDED Requirements

### ZCX-001 — Spanish error formatter for tool failures
`useZedChat` MUST route tool errors through `formatToolErrorForUser(toolName, errorObj)`. The literal `Error:` prefix MUST be removed; stack traces MUST be stripped. Known codes: `not_found`, `ambiguous`, `unsafe_url`, `policy_blocked`, `script_too_long`.

#### Scenario: terminal not found
- GIVEN `resolveTerminalByName` returned `not_found` for `Maverick`
- WHEN the chat renders
- THEN the user sees exactly `no encontré ninguna terminal con ese nombre. Activas: Chase, Nate, Cesar.` with no `Error:` prefix and no stack.

#### Scenario: ambiguous name lists candidates
- GIVEN two terminals named `Chase`
- WHEN the result renders
- THEN the user sees `hay varias terminales con nombres parecidos: Chase (p1), Chase (p2). ¿a cuál te referís?`

#### Scenario: multiline cap exceeded
- GIVEN the 64-line cap is hit
- WHEN the result renders
- THEN the user sees `el script es demasiado largo (máximo 64 líneas × 256 caracteres).`

### ZCX-002 — System prompt `### Terminales nombradas` section + welcome line
The system prompt at `docs/prompts/asistente/zed-system-prompt.md` MUST contain a `### Terminales nombradas` section inserted between the end of `### 9. get_swarm_status` (current line 137) and the `## ZED Orchestrator Pod` heading (current line 139). The section MUST be ≤ 8 lines, Spanish, and codify: (a) `displayName` is the address, (b) the resolver algorithm, (c) the 2-sentence digest rule. A one-line welcome note in `useZedChat` MUST state `sos Zed, tu copiloto de terminales. para tareas del swarm o lanzar agentes, usá el Pod.`

#### Scenario: prompt section in the right place
- GIVEN the system prompt
- WHEN loaded
- THEN the `### Terminales nombradas` heading appears strictly after `### 9. get_swarm_status` and strictly before `## ZED Orchestrator Pod`.

#### Scenario: prompt enumerates resolver rules
- GIVEN the new section
- WHEN read
- THEN it contains `displayName`, `Levenshtein`, and `2 frases` (or `dos frases`).

#### Scenario: welcome line in useZedChat
- GIVEN a fresh chat session
- WHEN `useZedChat` mounts
- THEN the first assistant message contains the welcome line starting `sos Zed, tu copiloto de terminales` and ending `usá el Pod.`

### ZCX-003 — Pizarra regression guard for `open_url`
When the user says "Abre github.com en pizarra", the right-dock MUST enter pizarra mode with `maximized: true` and `maximizedView: 'pizarra'`; the original terminal session MUST remain open; no `demaximize` event MUST fire.

#### Scenario: pizarra auto-layout survives open_url
- GIVEN a `devhub` terminal in focus, pizarra off
- WHEN the user says "Abre github.com en pizarra"
- THEN `open_url` fires, `browserLayoutEpoch` increments, `maximized: true` persists, and the terminal session id is unchanged.
