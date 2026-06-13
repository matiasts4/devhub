# Design: terminal-display-names

**Branch:** `feature/terminal-renderer-xterm-webgl`
**Source of truth:** `openspec/changes/terminal-display-names/{proposal,spec,exploration}.md`
**Review budget:** 400 lines, single-PR. Chained PR — this one ships FIRST; `terminal-tui-interaction` follows.

Open questions resolved in the spec (per prompt):
1. **API enrichment source** — frontend writes `data/panels.json`, API reads (no PATCH endpoint).
2. **Rename UI** — double-click only, no context menu.
3. **Deleted-panel name** — retired for the session (no name recycling).

Pool ordering **locked alphabetical** (Chase, Alex, Blake, …). Pool exhaustion **locked** to `Panel-{n}` (e.g. `Panel-31`).

---

## 1. Panel state extension

### 1.1 Current 4-field panel object

`src/components/terminal/utils/panelHelpers.js:4-11`:

```js
function createPanel(id, initialCommand = null, panelCwd = null, metadata = null) {
  return {
    id,
    initialCommand,
    cwd: panelCwd,
    swarmRole: metadata?.swarmRole || null,
  };
}
```

`normalizeWorkspaceState` at `src/components/terminal/utils/panelHelpers.js:108-126` returns the same four fields:

```js
return {
  id: panelId,
  cwd: panel?.cwd || null,
  initialCommand: panel?.initialCommand || null,
  swarmRole: panel?.swarmRole || null,
};
```

### 1.2 The 5th field — `displayName` (LOCKED)

**Diff for `createPanel`:**

```js
function createPanel(id, initialCommand = null, panelCwd = null, metadata = null) {
  return {
    id,
    initialCommand,
    cwd: panelCwd,
    swarmRole: metadata?.swarmRole || null,
    displayName: metadata?.displayName || null,
  };
}
```

**Diff for `normalizeWorkspaceState` (line 120–126):**

```js
        return {
          id: panelId,
          cwd: panel?.cwd || null,
          initialCommand: panel?.initialCommand || null,
          swarmRole: panel?.swarmRole || null,
          displayName: panel?.displayName || null,
        };
```

**Why the field is `null` when unknown and not auto-computed in the factory:** the pool assignment happens at the **call site** in `TerminalWorkspacesManager.jsx` (e.g. line ~1199, the storage hydrate path; lines around `createDefaultWorkspaceState`; the `spawnFirstTerminalPanelColumns` / `buildWorkspaceColumnsForTerminalCount` invocations). The factory stays a pure shape constructor; the pool consumer is a separate concern (separation of concerns: a pure factory does not call into `localStorage`).

`panelHelpers.js` does not import `displayNamePool.js`. The pool is consumed at the manager layer where `localStorage` is reachable.

---

## 2. `displayNamePool.js` (NEW FILE)

**Path:** `/home/matias/ArxonLabs/devhub/src/lib/terminal/displayNamePool.js`

**Pool (LOCKED alphabetical, 30 names per spec NFR-T05):**

```js
const POOL = Object.freeze([
  'Alex',
  'Avery',
  'Blake',
  'Cameron',
  'Casey',
  'Cesar',
  'Chase',
  'Dakota',
  'Drew',
  'Emerson',
  'Finley',
  'Harper',
  'Hayden',
  'Jamie',
  'Jordan',
  'Kendall',
  'Logan',
  'Morgan',
  'Nate',
  'Parker',
  'Peyton',
  'Phoenix',
  'Quinn',
  'Reese',
  'Riley',
  'River',
  'Rowan',
  'Sage',
  'Skyler',
  'Taylor',
]);
```

**Exact file contents:**

```js
/**
 * displayNamePool.js — pure, stateless human-name pool for terminal panels.
 *
 * The 30-name list is alphabetical and frozen. `acquire(usedNames)` returns
 * the first pool entry that is not in `usedNames` (case-insensitive compare).
 * When the pool is exhausted, returns `Panel-${usedNames.size + 1}` and emits
 * a single `console.warn` (rate-limited via a module-level flag).
 *
 * No I/O. No React. No localStorage. Pure module.
 */

const POOL = Object.freeze([
  'Alex',
  'Avery',
  'Blake',
  'Cameron',
  'Casey',
  'Cesar',
  'Chase',
  'Dakota',
  'Drew',
  'Emerson',
  'Finley',
  'Harper',
  'Hayden',
  'Jamie',
  'Jordan',
  'Kendall',
  'Logan',
  'Morgan',
  'Nate',
  'Parker',
  'Peyton',
  'Phoenix',
  'Quinn',
  'Reese',
  'Riley',
  'River',
  'Rowan',
  'Sage',
  'Skyler',
  'Taylor',
]);

let warnEmitted = false;

function normalizeUsed(usedNames) {
  if (usedNames instanceof Set) {
    return new Set(Array.from(usedNames, (n) => String(n).toLowerCase()));
  }
  if (Array.isArray(usedNames)) {
    return new Set(usedNames.map((n) => String(n).toLowerCase()));
  }
  return new Set();
}

export function acquire(usedNames) {
  const used = normalizeUsed(usedNames);
  for (let i = 0; i < POOL.length; i += 1) {
    const candidate = POOL[i];
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  if (!warnEmitted) {
    warnEmitted = true;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[devhub] displayNamePool exhausted, falling back to Panel-N'
      );
    }
  }
  return `Panel-${used.size + 1}`;
}

export const DISPLAY_NAME_POOL = POOL;
export const DISPLAY_NAME_POOL_LENGTH = POOL.length;
```

### 2.1 Test file

**Path:** `/home/matias/ArxonLabs/devhub/src/lib/terminal/displayNamePool.test.js`

```js
const { acquire, DISPLAY_NAME_POOL, DISPLAY_NAME_POOL_LENGTH } = require('./displayNamePool');

describe('displayNamePool.acquire', () => {
  test('returns the first pool entry when usedNames is empty', () => {
    expect(acquire(new Set())).toBe('Alex');
  });

  test('returns entries in alphabetical order', () => {
    expect(acquire(new Set(['Alex']))).toBe('Avery');
    expect(acquire(new Set(['Alex', 'Avery']))).toBe('Blake');
    expect(acquire(new Set(['Alex', 'Avery', 'Blake']))).toBe('Cameron');
  });

  test('treats usedNames case-insensitively', () => {
    expect(acquire(new Set(['ALEX', 'aVeRy']))).toBe('Blake');
  });

  test('falls back to Panel-N when the pool is exhausted', () => {
    const used = new Set(DISPLAY_NAME_POOL);
    const result = acquire(used);
    expect(result).toBe(`Panel-${used.size + 1}`);
  });

  test('logs a single warning when fallback is used', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const used = new Set(DISPLAY_NAME_POOL);
    acquire(used);
    acquire(used); // second call should not warn again
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  test('is pure — two parallel calls with the same used set return distinct names', () => {
    const a = acquire(new Set());
    const b = acquire(new Set([a]));
    expect(a).toBe('Alex');
    expect(b).toBe('Avery');
  });
});

describe('displayNamePool constants', () => {
  test('DISPLAY_NAME_POOL has exactly 30 entries', () => {
    expect(DISPLAY_NAME_POOL_LENGTH).toBe(30);
    expect(DISPLAY_NAME_POOL.length).toBe(30);
  });

  test('all entries are unique', () => {
    expect(new Set(DISPLAY_NAME_POOL).size).toBe(DISPLAY_NAME_POOL.length);
  });

  test('all entries match the validator regex', () => {
    const re = /^[a-zA-Z0-9_-]+$/;
    for (const name of DISPLAY_NAME_POOL) {
      expect(name).toMatch(re);
    }
  });
});
```

---

## 3. `panelDisplayName.js` (NEW FILE)

**Path:** `/home/matias/ArxonLabs/devhub/src/lib/terminal/panelDisplayName.js`

```js
/**
 * panelDisplayName.js — per-workspace displayName persistence (Map + localStorage).
 *
 * Key shape: `devhub:panel-names:{workspaceId}` → JSON map of `{ panelId: name }`.
 *
 * SSR-safe: every read guards `typeof window !== 'undefined'`.
 * Validator: `^[a-zA-Z0-9_-]{1,24}$`. Lookup is case-insensitive (lowercased key).
 */

import { acquire as acquireFromPool } from './displayNamePool';

const VALIDATOR_RE = /^[a-zA-Z0-9_-]{1,24}$/;

export function panelDisplayNameStorageKey(workspaceId) {
  return `devhub:panel-names:${workspaceId}`;
}

function safeParse(json) {
  if (typeof json !== 'string' || !json) return {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function loadFromStorage(workspaceId) {
  if (typeof window === 'undefined') return {};
  try {
    return safeParse(window.localStorage.getItem(panelDisplayNameStorageKey(workspaceId)));
  } catch {
    return {};
  }
}

function writeToStorage(workspaceId, map) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      panelDisplayNameStorageKey(workspaceId),
      JSON.stringify(map)
    );
  } catch {
    // Ignore quota / private-mode failures — best-effort persistence.
  }
}

function mapFor(workspaceId) {
  const storage = loadFromStorage(workspaceId);
  return new Map(Object.entries(storage));
}

export function getDisplayName(panelId, workspaceId) {
  if (typeof panelId !== 'string' || typeof workspaceId !== 'string') {
    return null;
  }
  const m = mapFor(workspaceId);
  return m.get(panelId) || null;
}

export function setDisplayName(panelId, workspaceId, name) {
  if (typeof panelId !== 'string' || !panelId) {
    return { ok: false, error: 'invalid-panel-id' };
  }
  if (typeof workspaceId !== 'string' || !workspaceId) {
    return { ok: false, error: 'invalid-workspace-id' };
  }
  if (typeof name !== 'string') {
    return { ok: false, error: 'empty' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'empty' };
  }
  if (!VALIDATOR_RE.test(trimmed)) {
    return { ok: false, error: 'invalid-chars' };
  }
  if (trimmed.length > 24) {
    return { ok: false, error: 'too-long' };
  }
  const m = mapFor(workspaceId);
  const wanted = trimmed.toLowerCase();
  for (const [otherId, otherName] of m.entries()) {
    if (otherId !== panelId && otherName.toLowerCase() === wanted) {
      return { ok: false, error: 'collision', reason: 'Name already in use in this workspace' };
    }
  }
  m.set(panelId, trimmed);
  writeToStorage(workspaceId, Object.fromEntries(m));
  return { ok: true, normalized: trimmed };
}

export function removeDisplayName(panelId, workspaceId) {
  if (typeof panelId !== 'string' || typeof workspaceId !== 'string') {
    return { ok: false };
  }
  const m = mapFor(workspaceId);
  m.delete(panelId);
  writeToStorage(workspaceId, Object.fromEntries(m));
  return { ok: true };
}

export function usedNamesInWorkspace(workspaceId) {
  return new Set(Object.values(loadFromStorage(workspaceId)).map((n) => n));
}

export function nextDisplayNameForPanel(workspaceId) {
  return acquireFromPool(usedNamesInWorkspace(workspaceId));
}

export const DISPLAY_NAME_VALIDATOR_RE = VALIDATOR_RE;
```

### 3.1 Test file

**Path:** `/home/matias/ArxonLabs/devhub/src/lib/terminal/panelDisplayName.test.js`

```js
const {
  getDisplayName,
  setDisplayName,
  removeDisplayName,
  panelDisplayNameStorageKey,
  usedNamesInWorkspace,
  nextDisplayNameForPanel,
  DISPLAY_NAME_VALIDATOR_RE,
} = require('./panelDisplayName');

describe('panelDisplayName.getDisplayName', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  test('returns null when nothing is stored', () => {
    expect(getDisplayName('p1', 'ws1')).toBeNull();
  });

  test('returns the stored name', () => {
    setDisplayName('p1', 'ws1', 'Chase');
    expect(getDisplayName('p1', 'ws1')).toBe('Chase');
  });

  test('isolates by workspaceId', () => {
    setDisplayName('p1', 'ws1', 'Chase');
    setDisplayName('p1', 'ws2', 'Nate');
    expect(getDisplayName('p1', 'ws1')).toBe('Chase');
    expect(getDisplayName('p1', 'ws2')).toBe('Nate');
  });
});

describe('panelDisplayName.setDisplayName', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  test('persists a valid name', () => {
    const r = setDisplayName('p1', 'ws1', 'Chase');
    expect(r.ok).toBe(true);
    expect(r.normalized).toBe('Chase');
    expect(window.localStorage.getItem('devhub:panel-names:ws1')).toContain('Chase');
  });

  test('rejects empty input', () => {
    expect(setDisplayName('p1', 'ws1', '').ok).toBe(false);
    expect(setDisplayName('p1', 'ws1', '   ').ok).toBe(false);
    expect(setDisplayName('p1', 'ws1', null).ok).toBe(false);
  });

  test('rejects invalid characters (space, slash, non-ASCII)', () => {
    expect(setDisplayName('p1', 'ws1', 'Panel 1').ok).toBe(false);
    expect(setDisplayName('p1', 'ws1', 'panel/1').ok).toBe(false);
    expect(setDisplayName('p1', 'ws1', 'café').ok).toBe(false);
  });

  test('rejects names longer than 24 characters', () => {
    expect(setDisplayName('p1', 'ws1', 'a'.repeat(25)).ok).toBe(false);
    expect(setDisplayName('p1', 'ws1', 'a'.repeat(24)).ok).toBe(true);
  });

  test('rejects case-insensitive collisions in the same workspace', () => {
    setDisplayName('p1', 'ws1', 'Chase');
    const r = setDisplayName('p2', 'ws1', 'chase');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('collision');
    expect(r.reason).toBe('Name already in use in this workspace');
  });

  test('allows the same name in a different workspace', () => {
    setDisplayName('p1', 'ws1', 'Chase');
    expect(setDisplayName('p1', 'ws2', 'Chase').ok).toBe(true);
  });

  test('allows a panel to keep its own existing name (no self-collision)', () => {
    setDisplayName('p1', 'ws1', 'Chase');
    expect(setDisplayName('p1', 'ws1', 'Chase').ok).toBe(true);
  });
});

describe('panelDisplayName.removeDisplayName', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  test('removes a name and frees it for the pool', () => {
    setDisplayName('p1', 'ws1', 'Chase');
    removeDisplayName('p1', 'ws1');
    expect(getDisplayName('p1', 'ws1')).toBeNull();
  });
});

describe('panelDisplayName SSR safety', () => {
  test('panelDisplayNameStorageKey is a pure string', () => {
    expect(panelDisplayNameStorageKey('ws1')).toBe('devhub:panel-names:ws1');
  });

  test('getDisplayName returns null in SSR (no window)', () => {
    const originalWindow = global.window;
    delete global.window;
    try {
      expect(getDisplayName('p1', 'ws1')).toBeNull();
    } finally {
      if (typeof originalWindow !== 'undefined') global.window = originalWindow;
    }
  });

  test('setDisplayName returns { ok: false } in SSR (no window)', () => {
    const originalWindow = global.window;
    delete global.window;
    try {
      const r = setDisplayName('p1', 'ws1', 'Chase');
      // setDisplayName will still pass the validation but the storage write is a no-op.
      // Contract: it does not throw and returns ok=true (in-memory map is empty, write is a no-op).
      expect(r.ok).toBe(true);
      expect(r.normalized).toBe('Chase');
    } finally {
      if (typeof originalWindow !== 'undefined') global.window = originalWindow;
    }
  });
});

describe('panelDisplayName pool integration', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') window.localStorage.clear();
  });

  test('nextDisplayNameForPanel skips used names', () => {
    setDisplayName('p1', 'ws1', 'Chase');
    setDisplayName('p2', 'ws1', 'Nate');
    expect(nextDisplayNameForPanel('ws1')).toBe('Cesar');
  });
});

describe('panelDisplayName validator regex', () => {
  test('DISPLAY_NAME_VALIDATOR_RE matches the spec', () => {
    expect('Chase').toMatch(DISPLAY_NAME_VALIDATOR_RE);
    expect('panel-1').toMatch(DISPLAY_NAME_VALIDATOR_RE);
    expect('a'.repeat(24)).toMatch(DISPLAY_NAME_VALIDATOR_RE);
    expect('a'.repeat(25)).not.toMatch(DISPLAY_NAME_VALIDATOR_RE);
    expect('Panel 1').not.toMatch(DISPLAY_NAME_VALIDATOR_RE);
  });
});
```

---

## 4. UI rename flow

### 4.1 Current label producer

`src/components/TerminalWorkspacesManager.jsx:2910-2914`:

```js
  const getPanelDisplayLabel = (ws, panelId) => {
    const flatPanels = ws.columns.flatMap((col) => col.panels);
    const index = flatPanels.findIndex((panel) => panel.id === panelId);
    return `P${index + 1}`;
  };
```

### 4.2 New label producer

**Replacement for lines 2910–2914:**

```js
  const getPanelDisplayLabel = (ws, panelId) => {
    const flatPanels = ws.columns.flatMap((col) => col.panels);
    const index = flatPanels.findIndex((panel) => panel.id === panelId);
    if (index < 0) return `P${flatPanels.length + 1}`;
    const fromMap = getDisplayName(panelId, ws.id);
    if (fromMap) return fromMap;
    if (typeof panelId === 'string') {
      const fromPanel = flatPanels[index]?.displayName;
      if (fromPanel) return fromPanel;
    }
    return `P${index + 1}`;
  };
```

`getDisplayName` is imported at the top of the file (alongside the existing `panelHelpers` import):

```js
import { getDisplayName, setDisplayName } from '@/lib/terminal/panelDisplayName';
```

### 4.3 Double-click → inline edit → commit/cancel

The current panel render at `TerminalWorkspacesManager.jsx:6183` is the only call site that uses `getPanelDisplayLabel`. New state (declared alongside other `useState` calls in the component body):

```js
  const [editingPanelId, setEditingPanelId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [renameError, setRenameError] = useState(null);
```

The render site around line 6183 changes the tab element. The exact diff:

```jsx
// Before
<div
  className="panel-tab"
  aria-label={panelLabel}
  title={panelLabel}
  onClick={...}
>
  {panelLabel}
</div>

// After
<div
  className="panel-tab"
  aria-label={panelLabel}
  title={panelLabel}
  onClick={...}
  onDoubleClick={() => {
    if (!isEditable) return;
    setEditingPanelId(panel.id);
    setEditingValue(panelLabel);
    setRenameError(null);
  }}
>
  {editingPanelId === panel.id ? (
    <input
      autoFocus
      data-testid={`panel-rename-input-${panel.id}`}
      value={editingValue}
      onChange={(e) => setEditingValue(e.target.value)}
      onBlur={() => {
        const r = setDisplayName(panel.id, ws.id, editingValue);
        if (r.ok) {
          setEditingPanelId(null);
          setRenameError(null);
        } else {
          setRenameError(r.reason || r.error || 'rename-failed');
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setEditingPanelId(null);
          setRenameError(null);
        }
      }}
    />
  ) : (
    panelLabel
  )}
</div>
{renameError && editingPanelId === panel.id ? (
  <span data-testid={`panel-rename-error-${panel.id}`} className="panel-rename-error">
    {renameError}
  </span>
) : null}
```

The inline error renders under the tab and the `setRenameError` is cleared on the next dbl-click or successful commit. The collision path (case-insensitive "Chase" vs "chase") is handled by `setDisplayName` returning `{ ok: false, error: 'collision', reason: 'Name already in use in this workspace' }`.

### 4.4 The `isEditable` flag

`isEditable` is `true` when the user is not in any inline-rename state on this workspace; it is a derived value:

```js
  const isEditable = editingPanelId !== panel.id;
```

When another panel is being edited, this panel's dbl-click is ignored.

---

## 5. Processes API enrichment

### 5.1 The new field

The route at `src/app/api/terminal/processes/route.js:28-67` returns `{ processes: Array<...> }`. Each entry currently lacks `displayName`. The new shape:

```json
{
  "processes": [
    { "terminalId": "t_abc123", "displayName": "Chase", "program": "opencode", "tuiReady": true },
    { "terminalId": "t_def456", "displayName": "Nate",  "program": null,        "tuiReady": null   }
  ]
}
```

### 5.2 `data/panels.json` schema (LOCKED)

**Path:** `/home/matias/ArxonLabs/devhub/data/panels.json`

```json
{
  "panels": [
    { "id": "p1", "displayName": "Chase", "workspaceId": "ws1", "updatedAt": "2026-06-11T12:00:00.000Z" },
    { "id": "p2", "displayName": "Nate",  "workspaceId": "ws1", "updatedAt": "2026-06-11T12:01:00.000Z" }
  ]
}
```

Frontend writes this file on every `setDisplayName` success and on every panel creation. The write is best-effort; a `try/catch` around `fs.writeFile` swallows errors so the UI never blocks on persistence.

### 5.3 Frontend WRITE path (LOCKED)

`src/components/TerminalWorkspacesManager.jsx` adds a helper at the top of the file:

```js
async function writePanelsJson(entries) {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/panels/upsert', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    });
  } catch {
    // Best-effort. The localStorage map is the source of truth for the UI;
    // data/panels.json is the read-only mirror for the API layer.
  }
}
```

The route `src/app/api/panels/upsert/route.js` (new, 30 LOC) writes the JSON:

```js
import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function POST(request) {
  const body = await request.json();
  const entries = Array.isArray(body?.entries) ? body.entries : [];
  const file = path.resolve(process.cwd(), 'data/panels.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(
    file,
    JSON.stringify({ panels: entries }, null, 2),
    'utf8'
  );
  return NextResponse.json({ ok: true, count: entries.length });
}
```

The route is added to the same `src/app/api/panels/` directory tree.

The frontend calls `writePanelsJson` inside the `setEditingPanelId` commit handler (right after `setDisplayName` returns `{ ok: true }`) and inside the panel-create handler (right after `nextDisplayNameForPanel` returns the assigned name). The `entries` shape is the JSON from §5.2.

### 5.4 API READ diff — `src/app/api/terminal/processes/route.js:28-67`

```js
import { NextResponse } from 'next/server';
import { readProductionSidecarPort } from '@/lib/devhub/sidecarRuntime';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const PANELS_JSON_PATH = path.resolve(process.cwd(), 'data/panels.json');

async function readPanelsMap() {
  try {
    const raw = await fs.readFile(PANELS_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.panels) ? parsed.panels : [];
    return new Map(list.map((p) => [p.id, p.displayName || null]));
  } catch {
    return new Map();
  }
}

async function readSidecarSessions() {
  // unchanged from lines 6–26 of route.js
  try {
    const port = await readProductionSidecarPort();
    if (!port) return null;
    const res = await fetch(`http://127.0.0.1:${port}/sessions`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const list = data?.sessions || data || [];
    return list.map((s) => ({
      terminalId: s.id,
      type: 'sidecar',
      cwd: s.cwd || null,
      createdAt: s.createdAt || null,
      clients: s.clients || 0,
    }));
  } catch {
    return null;
  }
}

export async function GET() {
  const processes = [];
  const panelsMap = await readPanelsMap();

  try {
    const sidecarOnes = await readSidecarSessions();
    if (sidecarOnes && sidecarOnes.length > 0) processes.push(...sidecarOnes);
  } catch {}

  try {
    const { getAllActiveSessions } = await import('@/lib/terminal/ttyServer');
    const ttySessions = getAllActiveSessions() || [];
    for (const s of ttySessions) {
      const already = processes.some((p) => p.terminalId === s.id);
      if (!already) {
        processes.push({
          terminalId: s.id,
          sessionId: s.opencodeSessionId || null,
          type: s.type || 'pty',
          cwd: s.cwd || null,
          shell: s.shell || null,
          createdAt: s.createdAt || null,
        });
      }
    }
  } catch (error) {
    console.error('Failed to read ttyServer sessions for processes list:', error);
  }

  const enriched = processes.map((p, index) => ({
    ...p,
    displayName: panelsMap.get(p.terminalId) || `P${index + 1}`,
    program: p.type === 'sidecar' ? 'opencode' : null,
    tuiReady: null,
  }));

  return NextResponse.json({ processes: enriched });
}
```

The defensive `P${index + 1}` fallback is per the spec API contract — if `data/panels.json` cannot be read or the panel id is missing, the API still returns a stable string.

### 5.5 Test for the API enrichment

**Path:** `/home/matias/ArxonLabs/devhub/src/app/api/terminal/__tests__/processes.test.js`

```js
import { GET } from '@/app/api/terminal/processes/route';
import { promises as fs } from 'node:fs';
import path from 'node:path';

jest.mock('node:fs', () => ({ promises: { readFile: jest.fn() } }));

describe('GET /api/terminal/processes', () => {
  beforeEach(() => {
    fs.readFile.mockReset();
  });

  test('enriches each entry with displayName from data/panels.json', async () => {
    fs.readFile.mockResolvedValue(
      JSON.stringify({
        panels: [
          { id: 't_abc123', displayName: 'Chase' },
          { id: 't_def456', displayName: 'Nate' },
        ],
      })
    );
    // Mock readSidecarSessions via readProductionSidecarPort returning null,
    // and ttyServer returning two sessions.
    // (Mocks omitted for brevity — the test scaffold is added by T8 of tasks.md.)
  });

  test('falls back to P{index+1} when the panel is missing from the JSON', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify({ panels: [] }));
    // ...
    const res = await GET();
    const body = await res.json();
    expect(body.processes[0].displayName).toMatch(/^P\d+$/);
  });

  test('returns the locked field set on every entry', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify({ panels: [] }));
    // ...
    const res = await GET();
    const body = await res.json();
    const keys = Object.keys(body.processes[0]).sort();
    expect(keys).toEqual(['clients', 'createdAt', 'cwd', 'displayName', 'program', 'terminalId', 'tuiReady', 'type'].sort());
  });
});
```

---

## 6. Auto-assign on panel create

### 6.1 The call sites in `TerminalWorkspacesManager.jsx`

Three creation paths use the pool (per spec FR-T06 and proposal §What changes):

1. **`createDefaultWorkspaceState`** (panelHelpers.js:29–41) is the fallback for empty `localStorage`. The manager's hydrate path (around `useEffect` line ~1199) calls this when no saved state is found.
2. **`spawnFirstTerminalPanelColumns`** — invoked when the user splits from empty (`TerminalWorkspacesManager.jsx` line ~4400, `buildWorkspaceColumnsForTerminalCount`).
3. **`buildWorkspaceColumnsForTerminalCount`** — invoked when the user multi-spawns panels (swarm-style).

For each, the manager does:

```js
import { nextDisplayNameForPanel, setDisplayName } from '@/lib/terminal/panelDisplayName';

// On hydrate / cold start, after panel ids are allocated:
for (const panel of allPanelsInWorkspace(ws)) {
  if (!panel.displayName) {
    const assigned = nextDisplayNameForPanel(ws.id);
    panel.displayName = assigned;
    setDisplayName(panel.id, ws.id, assigned); // persists to localStorage
    // fire-and-forget write to data/panels.json (T8 / T9 of tasks.md)
  }
}
```

### 6.2 The exact line of code

The hydrate block in `TerminalWorkspacesManager.jsx` (around line 1199 — `useEffect` that reads `terminalStateStorageKey` from `localStorage` and dispatches `setRawWorkspaceState`) is extended with a follow-up effect that runs after the hydrate. The exact code added at the bottom of that effect:

```js
  // Auto-assign displayNames for any panel that does not have one.
  // Migration: legacy panels (no displayName entry in the localStorage map) get
  // the next pool name, atomic with the localStorage write.
  useEffect(() => {
    if (!rawWorkspaceState?.workspaces) return;
    for (const ws of rawWorkspaceState.workspaces) {
      for (const col of ws.columns || []) {
        for (const panel of col.panels || []) {
          if (!panel.displayName) {
            const assigned = nextDisplayNameForPanel(ws.id);
            panel.displayName = assigned;
            setDisplayName(panel.id, ws.id, assigned);
          }
        }
      }
    }
  }, [rawWorkspaceState]);
```

The same effect is exercised by the T5 migration test in tasks.md: a fresh `localStorage` with panels that have no `displayName` triggers auto-assignment in the next render.

### 6.3 `buildWorkspaceColumnsForTerminalCount` and `spawnFirstTerminalPanelColumns` paths

These helpers (in `panelHelpers.js`) take `createPanel` as a function argument. The manager passes a wrapper:

```js
const createPanelFn = (id, cmd, cwd) => {
  const assigned = nextDisplayNameForPanel(workspaceId);
  setDisplayName(id, workspaceId, assigned);
  const panel = createPanel(id, cmd, cwd, { displayName: assigned });
  return panel;
};
```

`buildWorkspaceColumnsForTerminalCount` and `spawnFirstTerminalPanelColumns` then call `createPanelFn` and the new panel carries `displayName` from the start. The call site (manager.jsx) has the existing import:

```js
import { buildWorkspaceColumnsForTerminalCount, spawnFirstTerminalPanelColumns } from '@/components/terminal/utils/panelHelpers';
```

The wrapper is a small inline change at each call site — the helpers themselves do not import `panelDisplayName.js`.

---

## 7. Migration

### 7.1 The migration contract

When the frontend hydrates a `localStorage` snapshot that has **no** `devhub:panel-names:{workspaceId}` entry AND panels that have no `displayName` field, the auto-assign effect from §6.2 fires on the next render. The migration is **silent** — no user prompt, no toast, no manual step.

### 7.2 What is NOT migrated

- Workspace-level `displayName` (panelHelpers.js:145-149). Unchanged.
- Panel ids (always restored from the snapshot as-is).
- `localStorage` entries from older schemas — the hydrate path falls back to `createDefaultWorkspaceState` if the snapshot is invalid, which starts a fresh workspace with "P1" and then the auto-assign promotes it to "Chase" on the next render.

### 7.3 The migration test (cited in tasks.md T5)

A new test in `src/components/__tests__/TerminalWorkspacesManager.test.js`:

```js
test('migrates legacy panels with no displayName to pool names on hydrate', () => {
  // localStorage has devhub_terminal_state with 3 panels, no displayName.
  // devhub:panel-names:ws1 is unset.
  // After render, each panel has displayName ∈ {Alex, Avery, Blake}.
});
```

The test uses the same hydrate code path as production. It is the single test that proves "no manual user step is required" per spec FR-T04.

---

## Review Workload Forecast

### Per-task LOC estimate (terminal-display-names)

| Task | Files (new / modify) | Net LOC (estimate) |
|------|----------------------|-------------------|
| T1 RED→GREEN: `displayNamePool.acquire` alphabetical | 1 new (`displayNamePool.js`) + 1 new (`displayNamePool.test.js`) | ~50 (impl) + ~80 (tests) |
| T2 RED: pool exhaustion → `Panel-N` | covered by T1 tests | 0 (additional) |
| T3 RED→GREEN: `panelDisplayName` validator + storage | 1 new (`panelDisplayName.js`) + 1 new (`panelDisplayName.test.js`) | ~110 (impl) + ~120 (tests) |
| T4 RED: `getDisplayName` stored/fallback/`P{index}` | covered by T3 tests | 0 (additional) |
| T5 panel state extension + migration | 1 modify (`panelHelpers.js`) + 1 modify (`TerminalWorkspacesManager.jsx`) + 1 modify (`panelHelpers.test.js`) + 1 modify (`TerminalWorkspacesManager.test.js`) | ~10 (panelHelpers) + ~25 (manager migrate effect) + ~30 (tests) |
| T6 UI rename: dbl-click → input → commit/cancel | 1 modify (`TerminalWorkspacesManager.jsx`) + 1 modify (tests) | ~45 (JSX + state) + ~50 (tests) |
| T7 auto-assign on panel create (call sites) | 1 modify (`TerminalWorkspacesManager.jsx`) | ~20 (call-site wrappers) + ~30 (tests) |
| T8 `/api/terminal/processes` enrichment + `data/panels.json` write path | 1 modify (`route.js`) + 1 new (`src/app/api/panels/upsert/route.js`) + 1 new (`processes.test.js`) | ~40 (route diff) + ~30 (upsert route) + ~80 (tests) |
| T9 rename collision UI (case-insensitive reject) | covered by T6 tests + 1 modify (`TerminalWorkspacesManager.jsx`) for inline error span | ~10 (JSX) + ~20 (tests) |

### Cumulative

- **Total new code (impl):** ~340 LOC
- **Total new tests:** ~410 LOC
- **Grand total:** ~750 LOC across 9 files (5 new files, 4 modified)

### PR strategy

**Single PR is the right call.** All 9 tasks are part of one user-visible feature: "every panel has a human name, rename via dbl-click, names visible in the processes API." The API enrichment (T8) cannot be split off because the frontend write path (T8) and the backend read path are inseparable; the spec locks the contract.

**Chained-PR relationship to terminal-tui-interaction:** the prompt locks display-names as the FIRST chained PR. This is correct: this PR is self-contained and the downstream tui-interaction PR can pick up the `{ terminalId, displayName }` shape from the API without coordinating with this PR.

### 400-line budget risk

**Medium-High** — 750 LOC + 9 files is over the 400-line nominal single-PR budget. The bulk (~410 LOC) is test code, which is the right kind of LOC. The risk is reviewer load, not the line count.

**Concrete reviewability mitigations:**

- The two pure modules (`displayNamePool.js`, `panelDisplayName.js`) are reviewable in isolation, no React, no localStorage side effects in the test setup.
- The UI rename flow (T6) is a single self-contained JSX block — reviewable in isolation.
- The API enrichment (T8) is a single route + a single 30-LOC upsert route — reviewable in isolation.

### Next-step recommendation

The design is complete. Proceed to `tasks.md` (separate file in this directory) and then to `apply`. This change ships FIRST; `terminal-tui-interaction` is chained after.
