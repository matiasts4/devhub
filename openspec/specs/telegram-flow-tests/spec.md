# telegram-flow-tests Specification

## Purpose

Defines Telegram and AgentHub flow-test requirements for suite deduplication,
mock isolation, behavioral assertions, contextual conversation coverage,
bounded response timing, and smoke validation.

---

## Requirements

### Requirement: REQ-1 — Jest Suite Deduplication

The Jest configuration MUST exclude compiled Next.js output from discovery so no
test suite is collected twice.

#### Scenario: Compiled output is never discovered twice

- GIVEN `jest.config.js` ignores `<rootDir>/.next/`
- WHEN `npx jest --listTests` is executed from the project root
- THEN no discovered test path contains `.next/standalone`
- AND no discovered suite path appears more than once in the output

---

### Requirement: REQ-2 — Command Test Isolation

Every Telegram command test MUST run against mocked services only. Tests MUST
NOT hit the disk database, spawn live OpenCode processes, or open real network
connections.

#### Scenario: `db` singleton is mocked

- GIVEN a command depends on the `db` singleton
- WHEN the harness injects `mockService('db', ...)`
- THEN the command uses the mock instead of the real SQLite database

#### Scenario: `opencode` service is mocked

- GIVEN a command or conversation flow depends on `opencode`
- WHEN the harness injects `mockService('opencode', ...)`
- THEN the flow completes without spawning a live process or opening a socket

---

### Requirement: REQ-3 — Behavioral Command Assertions

Command tests MUST assert user-visible text derived from formatter output,
seeded data, or documented empty-state behavior. Tests SHOULD NOT rely only on
reply counts when a deterministic message is available.

#### Scenario: `/help` asserts real help content

- GIVEN the formatter returns help text containing `Ayuda` and `/estado`
- WHEN the `/help` test runs
- THEN the assertion checks visible help content
- AND it MUST NOT assert the unrelated string `'help'`

#### Scenario: Empty-state or summary commands assert rendered text

- GIVEN a command has no domain data or shows aggregate status
- WHEN `/estado`, `/progreso`, `/agentes`, or similar commands are tested
- THEN the test asserts specific rendered text or seeded values
- AND it MUST NOT pass with `replies.length >= 1` alone when richer output exists

---

### Requirement: REQ-4 — Contextual Two-Turn Plain-Text Conversation

The suite MUST verify a real two-turn plain-text conversation in the same chat,
with mocked `opencode`, where the second turn depends on context established by
the first turn.

#### Scenario: Follow-up plain-text message uses prior context

- GIVEN the DB mock is seeded with at least one pending task and `opencode` is mocked
- WHEN the user sends a plain-text task question and receives a reply
- AND the same user sends a second plain-text follow-up referencing that prior context
- THEN the bot returns one non-empty reply for each turn
- AND the second turn is handled without slash commands
- AND the second reply contains context-dependent content tied to the first turn

---

### Requirement: REQ-5 — No-Hang / Timeout-Bounded Responses

With mocked services, the bot MUST return a non-empty reply within 2000 ms for
supported commands and for the plain-text chat path.

#### Scenario: `/estado` responds within 2000 ms

- GIVEN the DB mock is seeded with project data
- WHEN the test sends `/estado` and measures elapsed time
- THEN the reply arrives in under 2000 ms

#### Scenario: `/tareas` responds within 2000 ms

- GIVEN the DB mock is seeded with task data
- WHEN the test sends `/tareas` and measures elapsed time
- THEN the reply arrives in under 2000 ms

#### Scenario: Plain-text message responds within 2000 ms

- GIVEN the `opencode` mock returns immediately
- WHEN the test sends a plain-text message and measures elapsed time
- THEN the reply arrives in under 2000 ms

---

### Requirement: REQ-6 — AgentHub Flow Smoke

The AgentHub flow suites MUST either pass or skip with a documented reason. No
unexpected runtime failure or suite hang is acceptable.

#### Scenario: `headless-lifecycle.test.js` exits cleanly

- GIVEN `headless-lifecycle.test.js` is executed
- WHEN the scoped Jest suite runs
- THEN each test either passes or skips with a string reason

#### Scenario: `mcp-toolchain.test.js` exits cleanly

- GIVEN `mcp-toolchain.test.js` is executed
- WHEN the scoped Jest suite runs
- THEN each test either passes or skips with a string reason
