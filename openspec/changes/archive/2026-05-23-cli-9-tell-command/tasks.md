# Tasks: CLI Tell Command

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180–250 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested work units | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain Strategy: feature-branch-chain
400-line budget risk: Low

## Phase 1: DB Barrel Re-exports

- [x] 1.1 Add re-exports in `devhub-cli/lib/db.js`: `createMissionMessage`, `upsertMessageDelivery`, `isMissionMessageKind`, `MISSION_MESSAGE_KINDS` from `../../src/lib/db/swarmMissions.js`
- [x] 1.2 Verify re-exports resolve correctly: `node -e "const db = require('./lib/db'); console.log(typeof db.createMissionMessage, typeof db.upsertMessageDelivery, typeof db.isMissionMessageKind, Array.isArray(db.MISSION_MESSAGE_KINDS))"`

## Phase 2: Tell Command — TDD (RED→GREEN→REFACTOR)

### 2.1 RED — Write failing test: bare command exits 2

- [x] 2.1.1 Create `devhub-cli/commands/tell.test.js` with test: `devhub tell` with no args → exit code 2, stderr shows usage

### 2.2 GREEN — Bare command handler

- [x] 2.2.1 Create `devhub-cli/commands/tell.js` stub: when no positional args, `process.stderr.write` usage, `process.exit(2)`
- [x] 2.2.2 Run test → passes

### 2.3 RED — Missing --mission exits 2

- [x] 2.3.1 Add test: `devhub tell worker-1 "msg" --sender s1` → exit code 2, stderr mentions missing mission

### 2.4 GREEN — Mission validation

- [x] 2.4.1 Add `--mission` option parsing; if missing, stderr + exit(2)
- [x] 2.4.2 Run test → passes

### 2.5 RED — Missing --sender exits 2

- [x] 2.5.1 Add test: `devhub tell worker-1 "msg" --mission m1` → exit code 2, stderr mentions missing sender

### 2.6 GREEN — Sender validation

- [x] 2.6.1 Add `--sender` option parsing; if missing, stderr + exit(2)
- [x] 2.6.2 Run test → passes

### 2.7 RED — Invalid --kind exits 2

- [x] 2.7.1 Add test: `devhub tell w1 "msg" --kind urgent --mission m1 --sender s1` → exit code 2, stderr mentions invalid kind

### 2.8 GREEN — Kind validation

- [x] 2.8.1 Validate `--kind` against `MISSION_MESSAGE_KINDS`; default to `directive`; invalid → stderr + exit(2)
- [x] 2.8.2 Run test → passes

### 2.9 RED — All valid kind values accepted

- [x] 2.9.1 Add test: iterate all 7 kind values → each exits 0 with valid args

### 2.10 GREEN — Kind acceptance

- [x] 2.10.1 Confirm validation allows all valid kinds; run test → passes

### 2.11 RED — Unknown mission exits 1

- [x] 2.11.1 Add test: seed DB with no missions, run tell → exit code 1, stderr mentions mission not found

### 2.12 GREEN — Mission existence check

- [x] 2.12.1 Before writing, query `missions` table; if null → stderr + exit(1)
- [x] 2.12.2 Run test → passes

### 2.13 RED — Successful DB write

- [x] 2.13.1 Add test: seed valid mission, run tell → exit 0, verify `mission_messages` row inserted with correct kind/sender/body, verify `message_deliveries` row with channel='devhub-cli' and status='pending'

### 2.14 GREEN — DB write implementation

- [x] 2.14.1 Call `ensureWriteSchema()` → `getDb()` → `createMissionMessage()` → `upsertMessageDelivery()` with recipient, channel='devhub-cli', status='pending'
- [x] 2.14.2 Run test → passes

### 2.15 RED — TTY human-readable output

- [x] 2.15.1 Add test: mock `process.stdout.isTTY = true` → stdout contains "Message sent:", recipient, kind

### 2.16 GREEN — TTY output

- [x] 2.16.1 On success with isTTY: print human-readable confirmation with message ID, recipient, kind, mission
- [x] 2.16.2 Run test → passes

### 2.17 RED — Piped JSON output

- [x] 2.17.1 Add test: mock `process.stdout.isTTY = false` → stdout is valid JSON with message_id, recipient, kind, mission, sender

### 2.18 GREEN — JSON output

- [x] 2.18.1 On success without isTTY: `console.log(JSON.stringify({message_id, recipient, kind, mission, sender}))`
- [x] 2.18.2 Run test → passes

### 2.19 REFACTOR — Clean up tell.js

- [x] 2.19.1 Extract arg parsing, validation, DB write, and output into named functions for readability
- [x] 2.19.2 Run full test suite → all pass

## Phase 3: Registration in cli.js

- [x] 3.1 Import `tellCommand` from `./commands/tell.js` in `devhub-cli/cli.js`
- [x] 3.2 Register `tell` subcommand with positional `<recipient>` and `<message>`, options `--kind`, `--mission`, `--sender`
- [x] 3.3 Smoke test: `node bin/devhub tell --help` shows correct usage

## Phase 4: Verify + Lint + Smoke

- [x] 4.1 Run `npm test` in `devhub-cli/` → zero failures (tell tests: 17/17 pass; pre-existing failures in other test files unchanged)
- [x] 4.2 Run linter if configured → no errors (no linter configured)
- [x] 4.3 Smoke: `node bin/devhub tell worker-1 "test" --mission <valid-id> --sender worker-2` → exit 0, correct output
- [x] 4.4 Smoke: `node bin/devhub tell` → exit 2, usage shown
