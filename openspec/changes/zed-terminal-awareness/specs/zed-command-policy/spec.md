# Spec: zed-command-policy (delta)

> FR: Z09. No baseline spec — all ADDED. Extends `zedCommandPolicy.js`.

## ADDED Requirements

### ZCP-001 — Multiline policy evaluation
`normalizeZedTerminalCommand` and `classifyZedTerminalCommand` MUST iterate over every line. Tier = `blocked` if any line is `blocked`; `allowed` if all lines are `allowed`; `approval_required` otherwise. The user-facing `command` echo and the `command_insist_counts` key MUST keep only the first line.

#### Scenario: all-allowed chained with `&&`
- GIVEN input `npm i && npm test` (single line)
- WHEN `classifyZedTerminalCommand` runs
- THEN tier follows per-segment rules (`allowed` or `approval_required`).

#### Scenario: blocked on any line wins
- GIVEN two lines: `npm test` then `rm -rf /`
- WHEN `classifyZedTerminalCommand` runs
- THEN tier is `blocked` and `reason` identifies the offending line.

#### Scenario: heredoc body allowed
- GIVEN `cat <<EOF` / `hello` / `EOF` (3 lines)
- WHEN `classifyZedTerminalCommand` runs
- THEN tier is `allowed` (heredoc body lines are not policy-scanned).

### ZCP-002 — Multiline cap + `>` strict-mode guard
`execute_in_terminal` MUST reject payloads exceeding 64 lines or 16,384 bytes. The `file-overwrite-redirect` pattern MUST only match when the line is purely `>` followed by a path (no leading non-whitespace content); `>` inside single-quoted args (e.g. `echo '{"x": ">"}'`) MUST be treated as safe.

#### Scenario: multiline cap exceeded
- GIVEN a payload of 65 lines
- WHEN the tool runs
- THEN result is `{ error: 'el comando no se puede ejecutar: tiene 65 líneas, excede el máximo' }` and no HTTP call is made.

#### Scenario: `>` inside JSON arg is safe
- GIVEN input `echo '{"x": ">"}'`
- WHEN `classifyZedTerminalCommand` runs
- THEN tier is `allowed` (not blocked).

#### Scenario: bare `>` redirect is blocked
- GIVEN input `> /etc/important.conf`
- WHEN `classifyZedTerminalCommand` runs
- THEN tier is `blocked` with `rule_id: 'file-overwrite-redirect'`.
