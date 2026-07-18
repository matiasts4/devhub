const { fuzzyScore, rankFuzzy } = require('../fuzzyScore');

describe('fuzzyScore', () => {
  test('matches subsequences and prefers shorter paths', () => {
    expect(fuzzyScore('src/components/TerminalDock.jsx', 'td')).not.toBeNull();
    expect(fuzzyScore('readme.md', 'zzz')).toBeNull();

    const ranked = rankFuzzy(
      [
        { rel: 'src/deeply/nested/config.js', name: 'config.js' },
        { rel: 'config.js', name: 'config.js' },
      ],
      'config',
      10
    );
    expect(ranked[0].rel).toBe('config.js');
  });
});
