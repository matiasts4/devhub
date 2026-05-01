const {
  buildLatexDocument,
  normalizeLatexForPreview,
} = require('../workspace/LatexDocumentPreview');

describe('LatexDocumentPreview helpers', () => {
  test('normalizes custom ArxonLabs contract macros into latex.js-friendly source', () => {
    const input = String.raw`\documentclass[11pt,a4paper]{article}
\usepackage{arxonlabscontract}

\begin{document}
\ArxonHeader{Acuerdo base de prestación de servicios digitales}{Entre Ruedas}{Landing comercial + catálogo}{29 de abril de 2026}
\MetaLine{Cliente}{Entre Ruedas Spa}
\ClauseListStart
\item hola
\ClauseListEnd
\SignatureBlock
\end{document}`;

    const output = normalizeLatexForPreview(input);

    expect(output).not.toContain('\\usepackage{arxonlabscontract}');
    expect(output).not.toContain('\\ArxonHeader');
    expect(output).not.toContain('\\MetaLine');
    expect(output).not.toContain('\\ClauseListStart');
    expect(output).not.toContain('\\ClauseListEnd');
    expect(output).not.toContain('\\SignatureBlock');
    expect(output).toContain('\\textbf{Entre Ruedas}');
    expect(output).toContain('\\textbf{Cliente}: Entre Ruedas Spa\\\\');
    expect(output).toContain('\\begin{itemize}');
    expect(output).toContain('\\end{itemize}');
    expect(output).toContain('\\textbf{Por el cliente}\\\\');
  });

  test('wraps partial latex snippets into a document', () => {
    const output = buildLatexDocument('\\section{Hola}');
    expect(output).toContain('\\documentclass{article}');
    expect(output).toContain('\\begin{document}');
    expect(output).toContain('\\section{Hola}');
    expect(output).toContain('\\end{document}');
  });
});
