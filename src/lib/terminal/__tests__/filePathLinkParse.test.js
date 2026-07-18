const { findFilePathMatches, splitPathLineColumn } = require('../filePathLinkParse');

describe('splitPathLineColumn', () => {
  test('strips :line:col', () => {
    expect(splitPathLineColumn('src/a.ts:12:3')).toEqual({
      path: 'src/a.ts',
      line: 12,
      column: 3,
    });
  });

  test('strips :line only', () => {
    expect(splitPathLineColumn('src/a.ts:42')).toEqual({
      path: 'src/a.ts',
      line: 42,
      column: undefined,
    });
  });

  test('no suffix', () => {
    expect(splitPathLineColumn('src/a.ts')).toEqual({ path: 'src/a.ts' });
  });
});

describe('findFilePathMatches', () => {
  test('windows absolute path', () => {
    const line = 'Edited D:\\devhub\\src\\lib\\foo.js successfully';
    const m = findFilePathMatches(line);
    expect(m.length).toBeGreaterThanOrEqual(1);
    expect(m[0].path.replace(/\//g, '\\').toLowerCase()).toContain('foo.js');
    expect(m[0].startCol).toBeGreaterThanOrEqual(0);
  });

  test('posix absolute path', () => {
    const m = findFilePathMatches('see /home/user/proj/src/app.tsx for details');
    expect(m.some((x) => x.path.includes('app.tsx'))).toBe(true);
  });

  test('relative path with line', () => {
    const m = findFilePathMatches('at src/components/TerminalTTY.jsx:120:5');
    expect(m.length).toBe(1);
    expect(m[0].path).toBe('src/components/TerminalTTY.jsx');
    expect(m[0].line).toBe(120);
    expect(m[0].column).toBe(5);
  });

  test('relative filename with extension only', () => {
    const m = findFilePathMatches('created package.json in root');
    expect(m.some((x) => x.path === 'package.json')).toBe(true);
  });

  test('rejects http urls', () => {
    const m = findFilePathMatches('docs https://example.com/foo.js and stuff');
    expect(m.every((x) => !x.path.includes('example.com'))).toBe(true);
  });

  test('empty line', () => {
    expect(findFilePathMatches('')).toEqual([]);
    expect(findFilePathMatches(null)).toEqual([]);
  });

  test('non-overlapping prefers longer earlier match', () => {
    const m = findFilePathMatches('open src/a.js and src/b.ts');
    expect(m.length).toBe(2);
    expect(m[0].path).toContain('a.js');
    expect(m[1].path).toContain('b.ts');
  });
});
