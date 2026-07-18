'use client';

import { useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import { detectCodeLanguage, MONACO_DIFF_OPTIONS } from './codeLanguages';

function MonacoLoading() {
  return (
    <div
      className="flex h-full w-full items-center justify-center gap-2 text-sm text-text-secondary"
      style={{ background: 'var(--chrome-panel-fill)' }}
    >
      <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
      Loading diff…
    </div>
  );
}

/**
 * Side-by-side working-tree vs HEAD (or index if staged).
 * Document previews (.md/.tex) should not use this — caller gates that.
 */
export function GitDiffView({ basePath, path, staged = false }) {
  const [state, setState] = useState({ kind: 'loading' });

  useEffect(() => {
    if (!basePath || !path) {
      setState({ kind: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    const qs = new URLSearchParams({
      base: basePath,
      path,
      staged: staged ? '1' : '0',
    });
    fetch(`/api/fs/git-diff?${qs}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load diff');
        if (cancelled) return;
        if (data.binary) {
          setState({ kind: 'binary' });
          return;
        }
        if (data.tooLarge) {
          setState({ kind: 'too_large' });
          return;
        }
        setState({
          kind: 'ready',
          original: data.original ?? '',
          modified: data.modified ?? '',
        });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: err?.message || String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [basePath, path, staged]);

  if (state.kind === 'loading' || state.kind === 'idle') return <MonacoLoading />;

  if (state.kind === 'error') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-status-error">
        {state.message}
      </div>
    );
  }

  if (state.kind === 'binary' || state.kind === 'too_large') {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-text-secondary">
        {state.kind === 'binary' ? 'Binary file — no text diff.' : 'File too large to diff here.'}
      </div>
    );
  }

  const language = detectCodeLanguage(path);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="git-diff-view">
      <div
        className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-[11px] text-text-secondary"
        style={{
          borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
          background: 'var(--chrome-panel-fill-emphasis)',
        }}
      >
        <span className="font-medium text-text-primary">Diff</span>
        <span className="opacity-50">·</span>
        <span className="truncate font-mono">{path}</span>
        <span className="ml-auto opacity-70">{staged ? 'HEAD → index' : 'HEAD → working'}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DiffEditor
          height="100%"
          language={language}
          theme="vs-dark"
          original={state.original}
          modified={state.modified}
          options={MONACO_DIFF_OPTIONS}
          loading={<MonacoLoading />}
        />
      </div>
    </div>
  );
}
