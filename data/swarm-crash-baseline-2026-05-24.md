# Swarm Crash Baseline Matrix

> **Generated:** 2026-05-24
> **Purpose:** Reproduce and document crash behavior at different agent counts.
> **Status:** Template — fill in during testing.

## Test Environment

| Item | Value |
|------|-------|
| Node version | _(run `node -v`)_ |
| better-sqlite3 | _(from package-lock.json)_ |
| OS | _(uname -a)_ |
| Total RAM | _(free -h)_ |
| DevHub DB path | _(data/devhub.db)_ |

## Test Matrix

### Test 1: Single Agent (director only)

| Step | Action | Expected | Observed |
|------|--------|----------|----------|
| 1 | Launch swarm with 1 agent | Agent boots, cwd correct | |
| 2 | Wait 30s | No crash, heartbeat present | |
| 3 | Check memory | < 500MB RSS | |
| 4 | Check WAL size | < 10MB | |
| 5 | Check processes | 1 opencode/codex/hermes | |

**Result:** ☐ PASS ☐ FAIL
**Notes:**

### Test 2: Three Agents (director + coder + auditor)

| Step | Action | Expected | Observed |
|------|--------|----------|----------|
| 1 | Launch swarm with 3 agents | All 3 boot, distinct cwd | |
| 2 | Wait 60s | No crash, 3 heartbeats | |
| 3 | Check memory | < 1.5GB RSS total | |
| 4 | Check WAL size | < 20MB | |
| 5 | Check processes | 3 agent processes | |
| 6 | Check dmesg | No trap/segfault | |

**Result:** ☐ PASS ☐ FAIL
**Notes:**

### Test 3: Five Agents (full swarm)

| Step | Action | Expected | Observed |
|------|--------|----------|----------|
| 1 | Launch swarm with 5 agents | All 5 boot, distinct cwd | |
| 2 | Wait 120s | No crash, 5 heartbeats | |
| 3 | Check memory | < 2.5GB RSS total | |
| 4 | Check WAL size | < 50MB | |
| 5 | Check processes | 5 agent processes | |
| 6 | Check dmesg | No trap/segfault | |
| 7 | Check orphaned processes | None | |

**Result:** ☐ PASS ☐ FAIL
**Notes:**

## Crash Evidence (if any)

### dmesg Output (after crash)

```bash
# Run: dmesg | tail -50
# Paste output here:
```

### Process List (after crash)

```bash
# Run: ps aux | grep -E 'node|opencode|codex|hermes|tmux'
# Paste output here:
```

### Memory Snapshot

```bash
# Run: free -h
# Paste output here:
```

### WAL Size

```bash
# Run: ls -lh data/devhub.db*
# Paste output here:
```

## Orphaned Processes

| PID | Command | Age | Action Taken |
|-----|---------|-----|--------------|
| | | | |

## Conclusions

- **Crash threshold:** _N agents_
- **Likely cause:** _SQLite contention / memory / PTY / other_
- **Recommendation:** _what to fix first_
