/**
 * terminalViewportSnapshot — pizarra-instant-enter A5.
 *
 * Contract pinned here:
 *   1. readViewportRowsFromTerm reads the visible viewport from a live
 *      xterm instance, right-trims rows, drops trailing blanks, caps at
 *      MAX_SNAPSHOT_ROWS, and NEVER throws on garbage input.
 *   2. captureTerminalViewportSnapshot saves only non-empty reads.
 *   3. getTerminalViewportSnapshot enforces SNAPSHOT_TTL_MS and drops
 *      expired entries eagerly.
 *   4. clear / reset remove entries.
 */

import {
  SNAPSHOT_TTL_MS,
  MAX_SNAPSHOT_ROWS,
  readViewportRowsFromTerm,
  captureTerminalViewportSnapshot,
  saveTerminalViewportSnapshot,
  getTerminalViewportSnapshot,
  clearTerminalViewportSnapshot,
  _resetTerminalViewportSnapshotsForTests,
} from '../terminalViewportSnapshot';

function fakeTerm(rows, { viewportY = 0, termRows } = {}) {
  return {
    rows: termRows ?? rows.length,
    buffer: {
      active: {
        viewportY,
        // xterm semantics: getLine(y) is an ABSOLUTE buffer line; the
        // viewport reads buffer.getLine(viewportY + i) for i < term.rows.
        getLine: (i) => {
          const text = rows[i];
          if (text === undefined) return null;
          return { translateToString: () => text };
        },
      },
    },
  };
}

beforeEach(() => {
  _resetTerminalViewportSnapshotsForTests();
});

describe('readViewportRowsFromTerm', () => {
  test('returns [] for null/garbage input and never throws', () => {
    expect(readViewportRowsFromTerm(null)).toEqual([]);
    expect(readViewportRowsFromTerm(undefined)).toEqual([]);
    expect(readViewportRowsFromTerm({})).toEqual([]);
    expect(readViewportRowsFromTerm({ buffer: {} })).toEqual([]);
    expect(
      readViewportRowsFromTerm({ buffer: { active: { getLine: () => ({}) } }, rows: 3 })
    ).toEqual([]);
  });

  test('reads visible rows, right-trims, drops trailing blanks', () => {
    const term = fakeTerm(['$ ls   ', 'foo.txt  ', '', '   ', '']);
    expect(readViewportRowsFromTerm(term)).toEqual(['$ ls', 'foo.txt']);
  });

  test('honours viewportY offset', () => {
    // Buffer holds 3 lines; a 2-row viewport is scrolled to the bottom.
    const term = fakeTerm(['scroll', '$ top', 'output'], { viewportY: 1, termRows: 2 });
    expect(readViewportRowsFromTerm(term)).toEqual(['$ top', 'output']);
  });

  test('caps at MAX_SNAPSHOT_ROWS', () => {
    const rows = Array.from({ length: MAX_SNAPSHOT_ROWS + 20 }, (_, i) => `line-${i}`);
    const term = fakeTerm(rows, { termRows: rows.length });
    expect(readViewportRowsFromTerm(term)).toHaveLength(MAX_SNAPSHOT_ROWS);
  });
});

describe('save/get/clear', () => {
  test('capture from a live term stores the rows', () => {
    const term = fakeTerm(['$ whoami', 'devhub']);
    const snapshot = captureTerminalViewportSnapshot('panel-1', term);
    expect(snapshot.rows).toEqual(['$ whoami', 'devhub']);
    expect(getTerminalViewportSnapshot('panel-1').rows).toEqual(['$ whoami', 'devhub']);
  });

  test('capture with empty content is a no-op', () => {
    expect(captureTerminalViewportSnapshot('panel-1', fakeTerm(['', '']))).toBeNull();
    expect(getTerminalViewportSnapshot('panel-1')).toBeNull();
  });

  test('save rejects empty/garbage rows', () => {
    expect(saveTerminalViewportSnapshot('panel-1', [])).toBeNull();
    expect(saveTerminalViewportSnapshot('panel-1', null)).toBeNull();
    expect(saveTerminalViewportSnapshot('', ['x'])).toBeNull();
    expect(getTerminalViewportSnapshot('panel-1')).toBeNull();
  });

  test('expired snapshots are dropped', () => {
    jest.useFakeTimers('modern');
    try {
      saveTerminalViewportSnapshot('panel-1', ['$ old']);
      jest.advanceTimersByTime(SNAPSHOT_TTL_MS + 1);
      expect(getTerminalViewportSnapshot('panel-1')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('clear removes the entry', () => {
    saveTerminalViewportSnapshot('panel-1', ['$ x']);
    clearTerminalViewportSnapshot('panel-1');
    expect(getTerminalViewportSnapshot('panel-1')).toBeNull();
  });

  test('snapshots are isolated per panelId', () => {
    saveTerminalViewportSnapshot('panel-1', ['one']);
    saveTerminalViewportSnapshot('panel-2', ['two']);
    expect(getTerminalViewportSnapshot('panel-1').rows).toEqual(['one']);
    expect(getTerminalViewportSnapshot('panel-2').rows).toEqual(['two']);
    clearTerminalViewportSnapshot('panel-1');
    expect(getTerminalViewportSnapshot('panel-1')).toBeNull();
    expect(getTerminalViewportSnapshot('panel-2').rows).toEqual(['two']);
  });
});

describe('capture hook wiring (source-grep contract)', () => {
  test('useTerminalEngine dispose path captures the viewport ghost', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../components/terminal/hooks/useTerminalEngine.js'),
      'utf8'
    );
    expect(source).toMatch(
      /import\s*\{\s*captureTerminalViewportSnapshot\s*\}\s*from\s*'@\/lib\/terminal\/terminalViewportSnapshot'/
    );
    expect(source).toMatch(/captureTerminalViewportSnapshot\(id, termRef\.current\)/);
  });
});
