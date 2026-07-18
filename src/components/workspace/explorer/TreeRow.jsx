'use client';

import { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { InlineInput } from './InlineInput';
import { explorerGitColor, explorerGitMarker } from './gitStatusColor';
import { fileIconUrl, folderIconUrl } from './iconResolver';

function EntryRowImpl({
  path,
  name,
  isDir,
  isExpanded,
  depth,
  actions,
  renameInProgress,
  isSelected,
  isRenaming,
  isDropTarget = false,
  onOpenFile,
  onSelectPath,
  gitStatusCode = null,
  gitignored = false,
  dndHandlers = null,
}) {
  const iconUrl = isDir ? folderIconUrl(name, isExpanded) : fileIconUrl(name);
  const paddingLeft = 6 + depth * 12;
  const showGit = !gitignored && gitStatusCode;
  const gitColor = showGit ? explorerGitColor(gitStatusCode) : '';
  const gitMarker = showGit ? explorerGitMarker(gitStatusCode) : '';

  if (isRenaming) {
    return (
      <div
        className="flex h-6 w-full min-w-0 items-center gap-2 px-1.5 text-[13px]"
        style={{ paddingLeft }}
        data-path={path}
        data-node-type={isDir ? 'directory' : 'file'}
      >
        <span className="size-3.5 shrink-0" />
        {iconUrl ? (
          <img src={iconUrl} alt="" className="size-4 shrink-0" />
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <InlineInput
          initial={name}
          onCommit={actions.commitRename}
          onCancel={actions.cancelRename}
        />
      </div>
    );
  }

  const handleClick = () => {
    if (renameInProgress) return;
    onSelectPath(path);
    if (isDir) actions.toggle(path);
    else onOpenFile(path);
  };

  return (
    <button
      type="button"
      data-fs-path={path}
      data-path={path}
      data-node-type={isDir ? 'directory' : 'file'}
      data-git-status={gitStatusCode || undefined}
      draggable
      onDragStart={(e) => dndHandlers?.onDragStart?.(e, path)}
      onDragOver={(e) => dndHandlers?.onDragOver?.(e, path, isDir)}
      onDragLeave={(e) => dndHandlers?.onDragLeave?.(e, path)}
      onDrop={(e) => dndHandlers?.onDrop?.(e, path, isDir)}
      onDragEnd={(e) => dndHandlers?.onDragEnd?.(e)}
      onClick={handleClick}
      onDoubleClick={() => !isDir && actions.beginRename(path)}
      className={[
        'group relative flex h-6 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 text-left text-[12.5px] transition-colors',
        isSelected
          ? 'bg-surface-elevated text-text-primary before:absolute before:inset-y-0.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent-primary'
          : gitignored
            ? 'text-text-muted/70 hover:bg-surface-hover'
            : 'text-text-secondary/90 hover:bg-surface-hover hover:text-text-primary',
        isDropTarget ? 'ring-1 ring-inset ring-accent-primary/60 bg-accent-primary/10' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft }}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-text-muted">
        {isDir ? (
          <ChevronRight
            className={['h-3 w-3 transition-transform', isExpanded ? 'rotate-90' : '']
              .filter(Boolean)
              .join(' ')}
            strokeWidth={2.25}
          />
        ) : null}
      </span>
      {iconUrl ? (
        <img src={iconUrl} alt="" className="size-4 shrink-0" />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span
        className="min-w-0 flex-1 truncate"
        style={gitColor && !isSelected ? { color: gitColor } : undefined}
      >
        {name}
      </span>
      {gitMarker ? (
        <span
          className="shrink-0 text-[10px] font-semibold leading-none"
          data-testid="explorer-git-marker"
          style={{ color: gitColor || 'var(--text-muted)' }}
          title={`Git: ${gitMarker}`}
        >
          {gitMarker}
        </span>
      ) : null}
    </button>
  );
}

export const EntryRow = memo(EntryRowImpl);

export function PendingRow({ depth, kind, onCommit, onCancel }) {
  return (
    <div
      className="flex h-6 w-full min-w-0 items-center gap-2 px-1.5 text-[13px]"
      style={{ paddingLeft: 6 + depth * 12 }}
      data-testid="explorer-pending-row"
    >
      <span className="size-3.5 shrink-0" />
      <img
        src={kind === 'dir' ? folderIconUrl('', false) : fileIconUrl('untitled')}
        alt=""
        className="size-4 shrink-0 opacity-70"
      />
      <InlineInput
        initial=""
        placeholder={kind === 'dir' ? 'New folder' : 'New file'}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    </div>
  );
}

export function StatusRow({ depth, message, tone }) {
  return (
    <div
      className={[
        'h-6 truncate px-2 text-[11px] leading-6',
        tone === 'error' ? 'text-danger' : 'text-text-muted',
      ].join(' ')}
      style={{ paddingLeft: 6 + depth * 12 + 18 }}
    >
      {message}
    </div>
  );
}
