const {
  buildGitStatusMap,
  bubbleUpDirectoryStatuses,
  lookupGitStatus,
} = require('../gitStatusUtils');

describe('gitStatusUtils', () => {
  test('bubbles file status up to ancestor directories', () => {
    const map = buildGitStatusMap({
      changedFiles: [
        {
          path: 'src/a.js',
          indexStatus: ' ',
          worktreeStatus: 'M',
          untracked: false,
          unstaged: true,
        },
        {
          path: 'src/b.js',
          indexStatus: 'A',
          worktreeStatus: ' ',
          untracked: false,
          unstaged: false,
        },
      ],
    });
    bubbleUpDirectoryStatuses(map);
    expect(lookupGitStatus(map, 'src')).toBe('M');
    expect(lookupGitStatus(map, 'src/a.js')).toBe('M');
    expect(lookupGitStatus(map, 'src/b.js')).toBe('A');
  });
});
