/**
 * @jest-environment node
 */
const { parsePorcelainV2, scopeChangedFiles } = require('./route');

describe('git-status helpers', () => {
  test('parses porcelain v2 and untracked lines', () => {
    const files = parsePorcelainV2(
      ['1 .M N... 100644 100644 100644 abc def src/a.js', '? new.txt'].join('\n')
    );
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/a.js');
    expect(files[0].worktreeStatus).toBe('M');
    expect(files[1].untracked).toBe(true);
  });

  test('scopes paths when workspace is nested in repo (case-insensitive on win compare)', () => {
    const files = [
      {
        path: 'apps/web/src/a.js',
        indexStatus: ' ',
        worktreeStatus: 'M',
        untracked: false,
        unstaged: true,
      },
      {
        path: 'other/x.js',
        indexStatus: ' ',
        worktreeStatus: 'M',
        untracked: false,
        unstaged: true,
      },
    ];
    const scoped = scopeChangedFiles(files, '/repo', '/repo/apps/web');
    expect(scoped.map((f) => f.path)).toEqual(['src/a.js']);
  });
});
