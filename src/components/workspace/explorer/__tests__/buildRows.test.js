const { buildRows } = require('../buildRows');

describe('buildRows', () => {
  test('flattens expanded directories into entry rows', () => {
    const tree = {
      nodes: {
        '': {
          status: 'loaded',
          entries: [
            { name: 'src', kind: 'dir', path: 'src' },
            { name: 'README.md', kind: 'file', path: 'README.md' },
          ],
        },
        src: {
          status: 'loaded',
          entries: [{ name: 'a.js', kind: 'file', path: 'src/a.js' }],
        },
      },
      expanded: new Set(['src']),
      renaming: null,
      pendingCreate: null,
      joinPath: (p, n) => (p ? `${p}/${n}` : n),
    };

    const { rows, entryIndexByPath } = buildRows('', tree);
    expect(rows.map((r) => r.path || r.kind)).toEqual(['src', 'src/a.js', 'README.md']);
    expect(entryIndexByPath.get('src/a.js')).toBe(1);
  });

  test('shows loading status under expanded dir', () => {
    const tree = {
      nodes: {
        '': {
          status: 'loaded',
          entries: [{ name: 'src', kind: 'dir', path: 'src' }],
        },
        src: { status: 'loading' },
      },
      expanded: new Set(['src']),
      renaming: null,
      pendingCreate: null,
      joinPath: (p, n) => (p ? `${p}/${n}` : n),
    };

    const { rows } = buildRows('', tree);
    expect(rows.some((r) => r.kind === 'status' && r.message === 'Loading…')).toBe(true);
  });
});
