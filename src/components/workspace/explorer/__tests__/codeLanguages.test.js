const {
  detectCodeLanguage,
  isCodeDiffablePath,
  isDocumentPreviewPath,
} = require('../codeLanguages');

describe('codeLanguages', () => {
  test('detects common code languages', () => {
    expect(detectCodeLanguage('src/a.jsx')).toBe('javascript');
    expect(detectCodeLanguage('src/a.ts')).toBe('typescript');
    expect(detectCodeLanguage('Cargo.toml')).toBe('ini');
    expect(detectCodeLanguage('script.py')).toBe('python');
  });

  test('keeps md/tex as document preview paths', () => {
    expect(isDocumentPreviewPath('README.md')).toBe(true);
    expect(isDocumentPreviewPath('paper.tex')).toBe(true);
    expect(isDocumentPreviewPath('src/a.js')).toBe(false);
  });

  test('code is diffable; docs and media are not', () => {
    expect(isCodeDiffablePath('src/a.js')).toBe(true);
    expect(isCodeDiffablePath('README.md')).toBe(false);
    expect(isCodeDiffablePath('img.png')).toBe(false);
  });
});
