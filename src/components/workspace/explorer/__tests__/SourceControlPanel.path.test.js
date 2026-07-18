/**
 * Path helpers mirrored from SourceControlPanel.
 * (basename / dirname are not exported; this locks the display contract.)
 */
function basename(filePath) {
  const parts = String(filePath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(filePath || '');
}

function dirname(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalized.slice(0, index);
}

describe('source-control path labels', () => {
  test('shows basename + parent dir for compact change rows', () => {
    expect(basename('src/components/TerminalTTY.jsx')).toBe('TerminalTTY.jsx');
    expect(dirname('src/components/TerminalTTY.jsx')).toBe('src/components');
    expect(dirname('package.json')).toBe('');
  });
});
