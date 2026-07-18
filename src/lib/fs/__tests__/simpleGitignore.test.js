const { compileGitignore } = require('../simpleGitignore');

describe('compileGitignore', () => {
  test('ignores node_modules and negated rules', () => {
    const isIgnored = compileGitignore(['node_modules/', 'dist', '!dist/keep.js'].join('\n'));
    expect(isIgnored('node_modules/pkg', true)).toBe(true);
    expect(isIgnored('dist/out.js', false)).toBe(true);
    expect(isIgnored('dist/keep.js', false)).toBe(false);
    expect(isIgnored('src/a.js', false)).toBe(false);
  });
});
