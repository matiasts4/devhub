const { explorerGitColor, explorerGitMarker } = require('../gitStatusColor');

describe('gitStatusColor', () => {
  test('returns theme CSS vars and markers', () => {
    expect(explorerGitColor('M')).toBe('var(--explorer-git-m)');
    expect(explorerGitColor('U')).toBe('var(--explorer-git-u)');
    expect(explorerGitMarker('A')).toBe('A');
    expect(explorerGitColor('Z')).toBe('');
  });
});
