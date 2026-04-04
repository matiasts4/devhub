import { useState, useMemo } from 'react';
import { Copy, Columns, AlignLeft, Check, FileCode } from 'lucide-react';
import { createTwoFilesPatch, parsePatch } from 'diff';

// Map common extensions to language names
const LANG_MAP = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  css: 'css',
  scss: 'scss',
  html: 'html',
  json: 'json',
  yaml: 'yaml',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  md: 'markdown',
};

function detectLanguage(filename) {
  if (!filename) return 'text';
  const ext = filename.split('.').pop().toLowerCase();
  return LANG_MAP[ext] || 'text';
}

function generateDiff(original, modified, filename) {
  if (!original && !modified) return '';
  const oldStr = original || '';
  const newStr = modified || '';
  const fname = filename || 'file';
  return createTwoFilesPatch(`a/${fname}`, `b/${fname}`, oldStr, newStr, 'original', 'modified');
}

/**
 * Parse unified diff into structured lines for rendering.
 */
function parseDiffLines(diffText) {
  if (!diffText) return [];
  return diffText.split('\n').map((line, idx) => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      return { id: idx, type: 'added', content: line };
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      return { id: idx, type: 'removed', content: line };
    }
    if (line.startsWith('@@')) {
      return { id: idx, type: 'hunk', content: line };
    }
    if (
      line.startsWith('+++') ||
      line.startsWith('---') ||
      line.startsWith('diff') ||
      line.startsWith('index')
    ) {
      return { id: idx, type: 'meta', content: line };
    }
    return { id: idx, type: 'normal', content: line };
  });
}

/**
 * Build side-by-side view data from original/modified content.
 */
function buildSideBySide(original, modified) {
  const origLines = (original || '').split('\n');
  const modLines = (modified || '').split('\n');
  const maxLen = Math.max(origLines.length, modLines.length);
  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    const orig = i < origLines.length ? origLines[i] : null;
    const mod = i < modLines.length ? modLines[i] : null;
    rows.push({
      lineNum: i + 1,
      orig,
      mod,
      origChanged: orig !== null && mod !== null && orig !== mod,
      origRemoved: orig !== null && mod === null,
      modAdded: mod !== null && orig === null,
      modChanged: mod !== null && orig !== null && orig !== mod,
    });
  }
  return rows;
}

/**
 * FileDiffPreview — shows a side-by-side or unified diff of file changes.
 *
 * Props:
 *   original:  string — original file content
 *   modified:  string — modified file content
 *   filename:  string — name of the file
 *   language:  string — optional language override (auto-detected from filename)
 */
export default function FileDiffPreview({ original, modified, filename, language }) {
  const [viewMode, setViewMode] = useState('unified'); // 'unified' | 'side-by-side'
  const [copied, setCopied] = useState(false);

  const lang = language || detectLanguage(filename);
  const diffText = useMemo(
    () => generateDiff(original, modified, filename),
    [original, modified, filename]
  );
  const diffLines = useMemo(() => parseDiffLines(diffText), [diffText]);
  const sideBySide = useMemo(() => buildSideBySide(original, modified), [original, modified]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(diffText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!original && !modified) {
    return (
      <div
        className="rounded-xl border p-8 text-center text-sm"
        style={{
          background: 'var(--surface-card)',
          borderColor: 'var(--border-strong)',
          color: 'var(--text-muted)',
        }}
      >
        No hay contenido para comparar
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border-strong)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ background: 'var(--surface-muted)', borderColor: 'var(--border-strong)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-primary)' }} />
          <span className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
            {filename || 'file'}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono uppercase"
            style={{ background: 'var(--surface-hover)', color: 'var(--text-muted)' }}
          >
            {lang}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <button
            onClick={() => setViewMode('unified')}
            className="p-1.5 rounded transition-colors cursor-pointer"
            style={{
              color: viewMode === 'unified' ? 'var(--accent-primary)' : 'var(--text-muted)',
              background:
                viewMode === 'unified'
                  ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)'
                  : 'transparent',
            }}
            title="Unified view"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('side-by-side')}
            className="p-1.5 rounded transition-colors cursor-pointer"
            style={{
              color: viewMode === 'side-by-side' ? 'var(--accent-primary)' : 'var(--text-muted)',
              background:
                viewMode === 'side-by-side'
                  ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)'
                  : 'transparent',
            }}
            title="Side-by-side view"
          >
            <Columns className="w-3.5 h-3.5" />
          </button>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded transition-colors cursor-pointer"
            style={{ color: copied ? 'var(--success, #22c55e)' : 'var(--text-muted)' }}
            title="Copy diff"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Diff body */}
      <div
        className="font-mono text-sm overflow-auto max-h-[500px]"
        style={{ background: 'var(--surface-elevated)' }}
      >
        {viewMode === 'unified' ? (
          /* Unified view */
          <div className="p-3 leading-6">
            {diffLines.map((line) => {
              const styles = {
                added: {
                  background: 'color-mix(in srgb, #22c55e 10%, transparent)',
                  color: '#4ade80',
                },
                removed: {
                  background: 'color-mix(in srgb, #ef4444 10%, transparent)',
                  color: '#f87171',
                },
                hunk: { color: 'var(--accent-primary)', opacity: 0.7 },
                meta: { color: 'var(--text-muted)', opacity: 0.5 },
                normal: { color: 'var(--text-secondary)' },
              };
              return (
                <div
                  key={line.id}
                  className="px-2 rounded-sm whitespace-pre"
                  style={styles[line.type]}
                >
                  {line.content || ' '}
                </div>
              );
            })}
          </div>
        ) : (
          /* Side-by-side view */
          <div
            className="grid grid-cols-2 divide-x"
            style={{ divideColor: 'var(--border-subtle)' }}
          >
            {/* Original column */}
            <div className="p-3">
              <div
                className="text-[10px] uppercase tracking-wider mb-2 font-sans"
                style={{ color: 'var(--text-muted)' }}
              >
                Original
              </div>
              {sideBySide.map((row) => {
                const isRemoved = row.origRemoved || row.origChanged;
                return (
                  <div
                    key={row.lineNum}
                    className="flex leading-6 whitespace-pre"
                    style={{
                      background: isRemoved
                        ? 'color-mix(in srgb, #ef4444 10%, transparent)'
                        : 'transparent',
                      color: isRemoved ? '#f87171' : 'var(--text-secondary)',
                    }}
                  >
                    <span
                      className="w-8 text-right pr-3 select-none flex-shrink-0"
                      style={{ color: 'var(--text-muted)', opacity: 0.3 }}
                    >
                      {row.orig !== null ? row.lineNum : ''}
                    </span>
                    <span className="flex-1">{row.orig !== null ? row.orig : ' '}</span>
                  </div>
                );
              })}
            </div>

            {/* Modified column */}
            <div className="p-3">
              <div
                className="text-[10px] uppercase tracking-wider mb-2 font-sans"
                style={{ color: 'var(--text-muted)' }}
              >
                Modificado
              </div>
              {sideBySide.map((row) => {
                const isAdded = row.modAdded || row.modChanged;
                return (
                  <div
                    key={row.lineNum}
                    className="flex leading-6 whitespace-pre"
                    style={{
                      background: isAdded
                        ? 'color-mix(in srgb, #22c55e 10%, transparent)'
                        : 'transparent',
                      color: isAdded ? '#4ade80' : 'var(--text-secondary)',
                    }}
                  >
                    <span
                      className="w-8 text-right pr-3 select-none flex-shrink-0"
                      style={{ color: 'var(--text-muted)', opacity: 0.3 }}
                    >
                      {row.mod !== null ? row.lineNum : ''}
                    </span>
                    <span className="flex-1">{row.mod !== null ? row.mod : ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
