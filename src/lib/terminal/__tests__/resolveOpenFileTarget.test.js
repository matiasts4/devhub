const {
  resolveOpenFileTarget,
  relativeIfUnderRoot,
  toPosixPath,
} = require('../resolveOpenFileTarget');

describe('resolveOpenFileTarget', () => {
  const project = 'D:/devhub';

  test('empty fails', () => {
    expect(resolveOpenFileTarget({ rawPath: '' }).ok).toBe(false);
  });

  test('absolute under project → relative', () => {
    const r = resolveOpenFileTarget({
      rawPath: 'D:\\devhub\\src\\lib\\foo.js',
      projectRoot: project,
    });
    expect(r.ok).toBe(true);
    expect(r.openPath).toBe('src/lib/foo.js');
  });

  test('relative path', () => {
    const r = resolveOpenFileTarget({
      rawPath: 'src/components/A.jsx',
      projectRoot: project,
      cwd: project,
    });
    expect(r.ok).toBe(true);
    expect(r.openPath).toBe('src/components/A.jsx');
  });

  test('relative with ./', () => {
    const r = resolveOpenFileTarget({
      rawPath: './src/a.ts',
      projectRoot: project,
    });
    expect(r.ok).toBe(true);
    expect(r.openPath).toBe('src/a.ts');
  });

  test('absolute outside project kept absolute', () => {
    const r = resolveOpenFileTarget({
      rawPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts',
      projectRoot: project,
    });
    expect(r.ok).toBe(true);
    expect(toPosixPath(r.openPath).toLowerCase()).toContain('hosts');
  });

  test('relative under session cwd', () => {
    const r = resolveOpenFileTarget({
      rawPath: 'bar.js',
      projectRoot: project,
      cwd: 'D:/devhub/src',
    });
    expect(r.ok).toBe(true);
    expect(r.openPath).toBe('src/bar.js');
  });
});

describe('relativeIfUnderRoot', () => {
  test('case-insensitive drive', () => {
    expect(relativeIfUnderRoot('d:/devhub/a.js', 'D:/devhub')).toBe('a.js');
  });
});
