'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

const LATEX_PREVIEW_TAG = 'devhub-latex-preview';
const LATEX_ASSET_BASE_URL = '/vendor/latexjs/';
const UNSUPPORTED_LOCAL_PACKAGES = new Set(['arxonlabscontract']);

export function buildLatexDocument(source) {
  const raw = source || '';
  if (/\\documentclass\b|\\begin\{document\}/.test(raw)) {
    return raw;
  }

  return `\\documentclass{article}
\\begin{document}
${raw}
\\end{document}`;
}

function stripUnsupportedUsePackages(source) {
  return source.replace(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g, (fullMatch, packageList) => {
    const supportedPackages = String(packageList || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => !UNSUPPORTED_LOCAL_PACKAGES.has(entry));

    if (supportedPackages.length === 0) {
      return '';
    }

    return fullMatch.replace(packageList, supportedPackages.join(','));
  });
}

function readBalancedGroup(source, startIndex) {
  let cursor = startIndex;

  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1;
  }

  if (source[cursor] !== '{') {
    return null;
  }

  let depth = 0;

  for (let index = cursor; index < source.length; index += 1) {
    const char = source[index];

    if (char === '\\') {
      index += 1;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return {
          value: source.slice(cursor + 1, index),
          end: index + 1,
        };
      }
    }
  }

  return null;
}

function replaceMacroCalls(source, macroName, argCount, buildReplacement) {
  const token = `\\${macroName}`;
  let output = '';

  for (let index = 0; index < source.length; ) {
    if (source.startsWith(token, index)) {
      let cursor = index + token.length;
      const args = [];
      let isValidMacro = true;

      for (let argIndex = 0; argIndex < argCount; argIndex += 1) {
        const group = readBalancedGroup(source, cursor);
        if (!group) {
          isValidMacro = false;
          break;
        }

        args.push(group.value);
        cursor = group.end;
      }

      if (isValidMacro) {
        output += buildReplacement(args);
        index = cursor;
        continue;
      }
    }

    output += source[index];
    index += 1;
  }

  return output;
}

export function normalizeLatexForPreview(source) {
  let normalized = stripUnsupportedUsePackages(source || '');

  normalized = normalized.replace(/\\ClauseListStart\b/g, '\\begin{itemize}');
  normalized = normalized.replace(/\\ClauseListEnd\b/g, '\\end{itemize}');

  normalized = replaceMacroCalls(
    normalized,
    'ArxonHeader',
    4,
    ([subtitle, title, project, date]) =>
      `\\textbf{${title}}\\\\
${subtitle}\\\\
\\textbf{Proyecto:} ${project}\\\\
\\textbf{Fecha:} ${date}\\\\
\\bigskip
`
  );

  normalized = replaceMacroCalls(
    normalized,
    'MetaLine',
    2,
    ([label, value]) => `\\textbf{${label}}: ${value}\\\\
`
  );

  normalized = replaceMacroCalls(
    normalized,
    'SignatureBlock',
    0,
    () => `\\bigskip
\\textbf{Por el cliente}\\\\
\\textbf{Por ArxonLabs}\\\\
`
  );

  return normalized;
}

function hashContent(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export default function LatexDocumentPreview({ content = '', filePath = '' }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const documentSource = useMemo(
    () => normalizeLatexForPreview(buildLatexDocument(content)),
    [content]
  );
  const previewKey = useMemo(
    () => `${filePath}:${hashContent(documentSource)}`,
    [documentSource, filePath]
  );

  useEffect(() => {
    let cancelled = false;

    async function ensureLatexComponent() {
      if (typeof window === 'undefined' || typeof customElements === 'undefined') {
        return;
      }

      try {
        if (!customElements.get(LATEX_PREVIEW_TAG)) {
          const module = await import('latex.js');
          if (!customElements.get(LATEX_PREVIEW_TAG)) {
            customElements.define(LATEX_PREVIEW_TAG, module.LaTeXJSComponent);
          }
        }

        if (!cancelled) {
          setStatus('ready');
          setError('');
        }
      } catch (previewError) {
        if (!cancelled) {
          setStatus('error');
          setError(previewError?.message || 'No se pudo inicializar la vista previa LaTeX.');
        }
      }
    }

    ensureLatexComponent();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'error') {
    return (
      <div
        className="m-4 p-4 rounded-lg border border-[#F778BA33] bg-[#F778BA11] text-danger text-xs flex items-start gap-2"
        data-testid="latex-document-preview-error"
      >
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (status !== 'ready') {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-[#0b1220]"
        data-testid="latex-document-preview-loading"
      >
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </div>
    );
  }

  const PreviewTag = LATEX_PREVIEW_TAG;

  return (
    <div
      className="h-full overflow-auto bg-[radial-gradient(circle_at_top,#162033_0%,#0b1220_58%,#09111b_100%)] p-4 md:p-6"
      data-testid="latex-document-preview"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/8 bg-white/96 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <PreviewTag
          key={previewKey}
          baseURL={LATEX_ASSET_BASE_URL}
          hyphenate="false"
          style={{ display: 'block', width: '100%' }}
          data-testid="latex-document-element"
        >
          {documentSource}
        </PreviewTag>
      </div>
    </div>
  );
}
