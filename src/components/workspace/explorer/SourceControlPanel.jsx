'use client';

import { ChevronDown, ChevronRight, GitBranch, Loader2, RefreshCw, Undo2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { explorerGitColor } from './gitStatusColor';
import { fileIconUrl } from './iconResolver';
import { invalidateGitStatus } from './useGitStatus';

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

function normalizeCode(status) {
  const s = String(status || '')
    .trim()
    .toUpperCase();
  if (s === '?' || s === 'U') return 'U';
  if (s === 'A') return 'A';
  if (s === 'D') return 'D';
  if (s === 'R' || s === 'C') return 'R';
  return 'M';
}

function classify(file) {
  const staged =
    !file.untracked && file.indexStatus && file.indexStatus !== ' ' && file.indexStatus !== '?';
  const unstaged =
    file.untracked || file.unstaged || (file.worktreeStatus && file.worktreeStatus !== ' ');
  return { staged: Boolean(staged), unstaged: Boolean(unstaged) };
}

function codeForSide(file, side) {
  if (file.untracked) return 'U';
  if (side === 'staged') {
    const raw =
      file.indexStatus && file.indexStatus !== ' ' ? file.indexStatus : file.worktreeStatus;
    return normalizeCode(raw);
  }
  const raw =
    file.worktreeStatus && file.worktreeStatus !== ' ' ? file.worktreeStatus : file.indexStatus;
  return normalizeCode(raw);
}

function sortByPath(a, b) {
  return String(a.path).localeCompare(String(b.path));
}

export function SourceControlPanel({ basePath, onOpenFile }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedPath, setSelectedPath] = useState('');
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);

  const refresh = useCallback(async () => {
    if (!basePath) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/fs/git-status?base=${encodeURIComponent(basePath)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load status');
      setStatus(data);
    } catch (e) {
      setError(e?.message || String(e));
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { staged, changes } = useMemo(() => {
    const stagedList = [];
    const changesList = [];
    for (const file of status?.changedFiles || []) {
      const meta = classify(file);
      if (meta.staged) {
        stagedList.push({ ...file, code: codeForSide(file, 'staged') });
      }
      if (meta.unstaged || file.untracked) {
        changesList.push({ ...file, code: codeForSide(file, 'changes') });
      }
    }
    stagedList.sort(sortByPath);
    changesList.sort(sortByPath);
    return { staged: stagedList, changes: changesList };
  }, [status]);

  const branchLabel = useMemo(() => {
    if (status?.branch) return status.branch;
    if (!basePath) return '';
    const parts = String(basePath).replace(/\\/g, '/').split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  }, [basePath, status?.branch]);

  const mutate = useCallback(
    async (action, paths, extra = {}) => {
      if (!basePath) return;
      setBusy(true);
      setError('');
      try {
        const response = await fetch('/api/fs/git-mutate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base: basePath, action, paths, ...extra }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Git action failed');
        invalidateGitStatus();
        await refresh();
        if (action === 'commit') setMessage('');
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        setBusy(false);
      }
    },
    [basePath, refresh]
  );

  const openFile = useCallback(
    (file, openMeta) => {
      setSelectedPath(file.path);
      onOpenFile?.(file.path, openMeta);
    },
    [onOpenFile]
  );

  if (!basePath) {
    return <div className="p-3 text-xs text-text-muted">No workspace path</div>;
  }

  const canCommit = !busy && message.trim().length > 0 && staged.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="source-control-panel">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-borders-subtle px-2.5 py-2">
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11.5px] font-medium text-text-primary">
            {branchLabel || 'Changes'}
          </p>
          <p className="truncate text-[10px] text-text-muted">
            {staged.length} staged · {changes.length} changes
          </p>
        </div>
        <button
          type="button"
          title="Refresh"
          disabled={busy || loading}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary"
          onClick={() => void refresh()}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="flex-shrink-0 space-y-2 border-b border-borders-subtle px-2.5 py-2.5">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          rows={2}
          className="w-full resize-none rounded-md border border-borders-subtle bg-surface-elevated px-2.5 py-2 text-[12px] leading-snug text-text-primary outline-none placeholder:text-text-muted focus:border-accent-primary"
          data-testid="sc-commit-message"
        />
        <button
          type="button"
          disabled={!canCommit}
          className="w-full rounded-md bg-accent-primary px-2 py-1.5 text-[11.5px] font-semibold text-black disabled:opacity-40"
          data-testid="sc-commit-button"
          onClick={() => void mutate('commit', [], { message: message.trim() })}
        >
          {busy ? 'Working…' : `Commit${staged.length ? ` (${staged.length})` : ''}`}
        </button>
      </div>

      {error ? (
        <div className="m-2 rounded-md border border-[#F778BA33] bg-[#F778BA11] p-2 text-[11px] text-danger">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5 space-y-1">
        <Section
          title="Staged"
          count={staged.length}
          open={stagedOpen}
          onToggle={() => setStagedOpen((v) => !v)}
          actionLabel={staged.length ? 'Unstage all' : null}
          onAction={() =>
            void mutate(
              'unstage',
              staged.map((f) => f.path)
            )
          }
          actionDisabled={busy || staged.length === 0}
          emptyText="No staged changes"
        >
          {staged.map((file) => (
            <FileRow
              key={`s:${file.path}`}
              file={file}
              selected={selectedPath === file.path}
              stagedSide
              busy={busy}
              onOpen={() => openFile(file, { staged: true })}
              onToggleStage={() => void mutate('unstage', [file.path])}
            />
          ))}
        </Section>

        <Section
          title="Changes"
          count={changes.length}
          open={changesOpen}
          onToggle={() => setChangesOpen((v) => !v)}
          actionLabel={changes.length ? 'Stage all' : null}
          onAction={() =>
            void mutate(
              'stage',
              changes.map((f) => f.path)
            )
          }
          actionDisabled={busy || changes.length === 0}
          emptyText="Working tree clean"
        >
          {changes.map((file) => (
            <FileRow
              key={`c:${file.path}`}
              file={file}
              selected={selectedPath === file.path}
              stagedSide={false}
              busy={busy}
              onOpen={() => openFile(file, { staged: false })}
              onToggleStage={() => void mutate('stage', [file.path])}
              onDiscard={() => {
                if (
                  typeof window !== 'undefined' &&
                  !window.confirm(`Discard changes to ${file.path}?`)
                ) {
                  return;
                }
                void mutate('discard', [file.path]);
              }}
            />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  open,
  onToggle,
  actionLabel,
  onAction,
  actionDisabled,
  emptyText,
  children,
}) {
  return (
    <section className="rounded-md">
      <div className="sticky top-0 z-[1] flex h-[28px] items-center gap-1 bg-surface-app/95 px-1 backdrop-blur-sm">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex min-w-0 flex-1 items-center gap-1 rounded-sm px-1 py-0.5 text-left hover:bg-surface-hover"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-text-muted" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-text-muted" />
          )}
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {title}
          </span>
          <span className="tabular-nums text-[10.5px] text-text-muted/80">{count}</span>
        </button>
        {actionLabel ? (
          <button
            type="button"
            className="shrink-0 px-1.5 text-[10px] text-text-muted hover:text-text-primary disabled:opacity-40"
            disabled={actionDisabled}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {open ? (
        count === 0 ? (
          <p className="px-2 py-1.5 text-[11px] text-text-muted">{emptyText}</p>
        ) : (
          <div className="space-y-px pb-1">{children}</div>
        )
      ) : null}
    </section>
  );
}

function FileRow({ file, selected, stagedSide, busy, onOpen, onToggleStage, onDiscard }) {
  const color = explorerGitColor(file.code);
  const name = basename(file.path);
  const folder = dirname(file.path);
  const iconUrl = fileIconUrl(name);
  const marker = file.code || 'M';

  return (
    <div
      className={[
        'group relative flex h-[30px] items-center gap-1.5 rounded-md pl-2 pr-1.5 transition-colors',
        selected ? 'bg-surface-elevated text-text-primary' : 'hover:bg-surface-hover',
      ].join(' ')}
      data-selected={selected || undefined}
    >
      <span
        className="pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full"
        style={{
          background: color || 'var(--text-muted)',
          opacity: selected ? 1 : 0.7,
        }}
        aria-hidden
      />

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        title={file.path}
        data-testid="sc-file-open"
        onClick={onOpen}
      >
        {iconUrl ? (
          <img src={iconUrl} alt="" className="size-4 shrink-0" />
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 leading-none">
          <span
            className={[
              'truncate text-[12px] leading-tight',
              folder ? 'max-w-[55%] shrink-0' : 'min-w-0 flex-1',
              selected ? 'font-semibold text-text-primary' : 'font-medium text-text-primary/95',
            ].join(' ')}
          >
            {name}
          </span>
          {folder ? (
            <span className="min-w-0 flex-1 truncate text-[10.5px] leading-tight text-text-muted">
              {folder}
            </span>
          ) : null}
        </span>
      </button>

      {!stagedSide && onDiscard ? (
        <button
          type="button"
          title={`Discard ${file.path}`}
          disabled={busy}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted opacity-0 hover:bg-surface-elevated hover:text-text-primary group-hover:opacity-100 disabled:opacity-40"
          onClick={onDiscard}
        >
          <Undo2 className="h-3 w-3" />
        </button>
      ) : null}

      <span
        className="w-3 shrink-0 text-center text-[10px] font-semibold tabular-nums"
        style={color ? { color } : undefined}
        title={`Git: ${marker}`}
      >
        {marker}
      </span>

      <Checkbox
        aria-label={stagedSide ? `Unstage ${file.path}` : `Stage ${file.path}`}
        checked={stagedSide}
        disabled={busy}
        onCheckedChange={() => onToggleStage?.()}
        className="size-3.5 shrink-0"
      />
    </div>
  );
}
