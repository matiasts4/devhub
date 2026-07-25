'use client';

import { FilePlus, FolderPlus, RefreshCw, Search, Trash2, Pencil } from 'lucide-react';
import { EntryRow, PendingRow, StatusRow } from './TreeRow';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { buildRows } from './buildRows';
import { fileIconUrl, folderIconUrl } from './iconResolver';
import { useExplorerDnd } from './useExplorerDnd';
import { useFileTree } from './useFileTree';
import { useGitStatus } from './useGitStatus';
import { dirname } from './pathUtils';

const ROW_HEIGHT = 24;
const OVERSCAN = 8;

export const FileExplorer = memo(
  forwardRef(function FileExplorer(
    {
      basePath,
      activeFilePath = null,
      initialExpanded = [],
      onOpenFile,
      onExpandedChange,
      onPathRenamed,
      onPathDeleted,
      gitDecorations = true,
    },
    ref
  ) {
    const tree = useFileTree(basePath, {
      initialExpanded,
      onExpandedChange,
      onPathRenamed,
      onPathDeleted,
      deferSecondaryMs: 0,
    });
    const { lookup: lookupGitStatus } = useGitStatus(basePath, gitDecorations, {
      deferMs: 120,
    });
    const [selectedPath, setSelectedPath] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchHits, setSearchHits] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [menuTarget, setMenuTarget] = useState(null);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);
    const scrollRef = useRef(null);
    const explorerRef = useRef(null);

    const searchActive = searchQuery.trim().length >= 2;

    const { rows, entryIndexByPath } = useMemo(() => {
      if (!basePath) return { rows: [], entryIndexByPath: new Map() };
      return buildRows('', tree, lookupGitStatus);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [basePath, tree.nodes, tree.expanded, tree.renaming, tree.pendingCreate, lookupGitStatus]);

    const rowActions = useMemo(
      () => ({
        toggle: tree.toggle,
        beginRename: tree.beginRename,
        commitRename: tree.commitRename,
        cancelRename: tree.cancelRename,
      }),
      [tree.toggle, tree.beginRename, tree.commitRename, tree.cancelRename]
    );

    const renameInProgress = tree.renaming !== null || tree.pendingCreate !== null;

    const isDirAt = useCallback(
      (path) => {
        const idx = entryIndexByPath.get(path);
        const row = idx !== undefined ? rows[idx] : undefined;
        return row?.kind === 'entry' ? row.isDir : undefined;
      },
      [entryIndexByPath, rows]
    );

    const dnd = useExplorerDnd({
      rootPath: '',
      isDir: isDirAt,
      onMove: tree.movePath,
    });

    const entryPaths = useMemo(() => {
      const out = [];
      for (const row of rows) if (row.kind === 'entry') out.push(row.path);
      return out;
    }, [rows]);

    useEffect(() => {
      if (selectedPath && !entryIndexByPath.has(selectedPath)) {
        setSelectedPath(null);
      }
    }, [entryIndexByPath, selectedPath]);

    const virtualizer = useVirtualizer({
      count: rows.length,
      getScrollElement: () => scrollRef.current,
      estimateSize: () => ROW_HEIGHT,
      overscan: OVERSCAN,
      getItemKey: (index) => rows[index]?.key ?? index,
    });

    const scrollEntryIntoView = useCallback(
      (path) => {
        const index = entryIndexByPath.get(path);
        if (index === undefined) return;
        virtualizer.scrollToIndex(index, { align: 'auto' });
      },
      [entryIndexByPath, virtualizer]
    );

    const lastSyncedActivePathRef = useRef(null);
    useEffect(() => {
      if (!activeFilePath || activeFilePath === lastSyncedActivePathRef.current) return;
      if (!entryIndexByPath.has(activeFilePath)) return;
      lastSyncedActivePathRef.current = activeFilePath;
      setSelectedPath(activeFilePath);
      requestAnimationFrame(() => scrollEntryIntoView(activeFilePath));
    }, [activeFilePath, entryIndexByPath, scrollEntryIntoView]);

    useEffect(() => {
      const q = searchQuery.trim();
      if (q.length < 2 || !basePath) {
        setSearchHits(null);
        setSearchLoading(false);
        return undefined;
      }
      setSearchLoading(true);
      let alive = true;
      const debounceMs = process.env.NODE_ENV === 'test' ? 0 : 300;
      const timer = setTimeout(async () => {
        try {
          const response = await fetch(
            `/api/fs/search?base=${encodeURIComponent(basePath)}&q=${encodeURIComponent(q)}&limit=200`
          );
          const data = await response.json();
          if (!alive) return;
          if (!response.ok) throw new Error(data.error || 'Search failed');
          setSearchHits(Array.isArray(data.hits) ? data.hits : []);
        } catch {
          if (alive) setSearchHits([]);
        } finally {
          if (alive) setSearchLoading(false);
        }
      }, debounceMs);
      return () => {
        alive = false;
        clearTimeout(timer);
      };
    }, [basePath, searchQuery]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          containerRef.current?.focus();
          if (!selectedPath && entryPaths.length > 0) {
            const first = entryPaths[0];
            setSelectedPath(first);
            requestAnimationFrame(() => scrollEntryIntoView(first));
          }
        },
        refresh: () => tree.refreshAllLoaded(),
      }),
      [entryPaths, scrollEntryIntoView, selectedPath, tree]
    );

    const handleKeyDown = (e) => {
      if (tree.renaming || tree.pendingCreate || searchActive) return;
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (entryPaths.length === 0) return;

      const currentIdx = selectedPath ? entryPaths.indexOf(selectedPath) : -1;
      const move = (next) => {
        const clamped = Math.max(0, Math.min(entryPaths.length - 1, next));
        const path = entryPaths[clamped];
        setSelectedPath(path);
        requestAnimationFrame(() => scrollEntryIntoView(path));
      };

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(currentIdx < 0 ? 0 : currentIdx + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(currentIdx < 0 ? entryPaths.length - 1 : currentIdx - 1);
          break;
        case 'ArrowRight': {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          const row = idx !== undefined ? rows[idx] : null;
          if (row?.kind !== 'entry') break;
          if (row.isDir) {
            if (!row.isExpanded) tree.toggle(row.path);
            else move(currentIdx + 1);
          }
          break;
        }
        case 'ArrowLeft': {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          const row = idx !== undefined ? rows[idx] : null;
          if (row?.kind !== 'entry') break;
          if (row.isDir && row.isExpanded) {
            tree.toggle(row.path);
          } else {
            const parent = dirname(row.path);
            if (parent) setSelectedPath(parent);
          }
          break;
        }
        case 'Enter': {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          const idx = entryIndexByPath.get(path);
          const row = idx !== undefined ? rows[idx] : null;
          if (row?.kind !== 'entry') break;
          if (row.isDir) tree.toggle(row.path);
          else onOpenFile?.(row.path);
          break;
        }
        case 'F2': {
          if (currentIdx < 0) return;
          e.preventDefault();
          tree.beginRename(entryPaths[currentIdx]);
          break;
        }
        case 'Delete': {
          if (currentIdx < 0) return;
          e.preventDefault();
          const path = entryPaths[currentIdx];
          if (window.confirm(`Delete ${path}?`)) void tree.deletePath(path);
          break;
        }
        default:
          break;
      }
    };

    const openContextMenu = (e, target) => {
      e.preventDefault();
      setMenuTarget(target);
      setMenuPos({ x: e.clientX, y: e.clientY });
    };

    const closeMenu = () => setMenuTarget(null);

    if (!basePath) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-xs text-text-muted">
          No workspace path
        </div>
      );
    }

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          explorerRef.current = node;
        }}
        className="flex h-full min-h-0 flex-col outline-none"
        tabIndex={0}
        data-testid="editor-file-explorer"
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => {
          if (e.target === e.currentTarget || e.target === scrollRef.current) {
            openContextMenu(e, { path: '', name: 'workspace', isDir: true });
          }
        }}
      >
        <div className="flex-shrink-0 border-b border-borders-subtle px-2 py-2">
          <div className="mb-1.5 flex items-center gap-1">
            <button
              type="button"
              title="New file"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary"
              onClick={() =>
                tree.beginCreate(selectedPath && isDirAt(selectedPath) ? selectedPath : '', 'file')
              }
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="New folder"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary"
              onClick={() =>
                tree.beginCreate(selectedPath && isDirAt(selectedPath) ? selectedPath : '', 'dir')
              }
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Refresh"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text-primary"
              onClick={() => tree.refreshAllLoaded()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 border border-borders-subtle px-2.5 py-2 rounded-md bg-surface-elevated/40">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <input
              type="search"
              value={searchQuery}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Search files or paths"
              className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
              data-testid="editor-tree-search-input"
              aria-label="Search files"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="inline-flex h-5 items-center rounded-md px-1.5 text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                aria-label="Clear file search"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1"
          data-testid="editor-tree-scroll-region"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
          onDragOver={dnd.onRootDragOver}
          onDrop={dnd.onRootDrop}
        >
          {searchActive ? (
            searchLoading ? (
              <div className="p-2 text-[11px] text-text-muted" data-testid="editor-tree-loading">
                Buscando archivos…
              </div>
            ) : !searchHits || searchHits.length === 0 ? (
              <div
                className="rounded-md border border-borders-subtle bg-surface-elevated px-3 py-2 text-xs text-text-muted"
                data-testid="editor-tree-empty-search"
              >
                No files match “{searchQuery.trim()}”.
              </div>
            ) : (
              <div className="flex flex-col gap-0.5" data-testid="explorer-search-results">
                {searchHits.map((hit) => {
                  const rel = hit.rel || hit.path;
                  const icon = hit.is_dir ? folderIconUrl(hit.name, false) : fileIconUrl(hit.name);
                  return (
                    <button
                      key={rel}
                      type="button"
                      data-path={rel}
                      data-node-type={hit.is_dir ? 'directory' : 'file'}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      onClick={() => {
                        if (!hit.is_dir) onOpenFile?.(rel);
                      }}
                    >
                      {icon ? <img src={icon} alt="" className="size-4 shrink-0" /> : null}
                      <span className="min-w-0 flex-1 truncate">{rel}</span>
                    </button>
                  );
                })}
              </div>
            )
          ) : tree.isLoading && rows.length === 0 ? (
            <div className="space-y-3 p-2" data-testid="editor-tree-loading">
              <div className="text-[11px] text-text-muted">Cargando archivos del workspace…</div>
            </div>
          ) : tree.rootError ? (
            <div className="m-2 rounded-md border border-[#F778BA33] bg-[#F778BA11] p-2 text-xs text-danger">
              {tree.rootError}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-2 text-xs text-text-muted">No se encontraron archivos.</div>
          ) : (
            (() => {
              const virtualItems = virtualizer.getVirtualItems();
              // jsdom often reports 0 viewport size — fall back to full list.
              const useVirtual = virtualItems.length > 0;
              const indices = useVirtual ? virtualItems.map((v) => v.index) : rows.map((_, i) => i);

              const renderRow = (index) => {
                const row = rows[index];
                if (!row) return null;
                let content = null;
                if (row.kind === 'entry' || row.kind === 'rename') {
                  content = (
                    <div
                      onContextMenu={(e) =>
                        openContextMenu(e, {
                          path: row.path,
                          name: row.name,
                          isDir: row.isDir,
                        })
                      }
                    >
                      <EntryRow
                        path={row.path}
                        name={row.name}
                        isDir={row.isDir}
                        isExpanded={Boolean(row.isExpanded)}
                        depth={row.depth}
                        actions={rowActions}
                        renameInProgress={renameInProgress}
                        isSelected={selectedPath === row.path}
                        isRenaming={row.kind === 'rename'}
                        isDropTarget={dnd.dropTargetDir === row.path}
                        onOpenFile={onOpenFile}
                        onSelectPath={setSelectedPath}
                        gitStatusCode={row.gitStatusCode}
                        gitignored={row.gitignored}
                        dndHandlers={dnd.handlers}
                      />
                    </div>
                  );
                } else if (row.kind === 'pending') {
                  content = (
                    <PendingRow
                      depth={row.depth}
                      kind={row.pendingKind}
                      onCommit={tree.commitCreate}
                      onCancel={tree.cancelCreate}
                    />
                  );
                } else if (row.kind === 'status') {
                  content = <StatusRow depth={row.depth} message={row.message} tone={row.tone} />;
                }
                return { row, content, index };
              };

              if (!useVirtual) {
                return (
                  <div>
                    {indices.map((index) => {
                      const rendered = renderRow(index);
                      if (!rendered) return null;
                      return (
                        <div key={rendered.row.key} data-index={index}>
                          {rendered.content}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualItems.map((virtualRow) => {
                    const rendered = renderRow(virtualRow.index);
                    if (!rendered) return null;
                    return (
                      <div
                        key={rendered.row.key}
                        data-index={virtualRow.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {rendered.content}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>

        {menuTarget ? (
          <div
            className="fixed inset-0 z-50"
            data-testid="explorer-context-menu-backdrop"
            onClick={closeMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeMenu();
            }}
          >
            <div
              role="menu"
              className="absolute min-w-[160px] rounded-md border border-borders-subtle bg-surface-elevated py-1 shadow-lg"
              style={{ left: menuPos.x, top: menuPos.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover"
                onClick={() => {
                  tree.beginCreate(
                    menuTarget.isDir ? menuTarget.path : dirname(menuTarget.path),
                    'file'
                  );
                  closeMenu();
                }}
              >
                <FilePlus className="h-3.5 w-3.5" /> New File
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover"
                onClick={() => {
                  tree.beginCreate(
                    menuTarget.isDir ? menuTarget.path : dirname(menuTarget.path),
                    'dir'
                  );
                  closeMenu();
                }}
              >
                <FolderPlus className="h-3.5 w-3.5" /> New Folder
              </button>
              {menuTarget.path ? (
                <>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover"
                    onClick={() => {
                      tree.beginRename(menuTarget.path);
                      closeMenu();
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-surface-hover"
                    onClick={() => {
                      if (window.confirm(`Delete ${menuTarget.path}?`)) {
                        void tree.deletePath(menuTarget.path);
                      }
                      closeMenu();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-primary hover:bg-surface-hover"
                onClick={() => {
                  tree.refresh(menuTarget.isDir ? menuTarget.path : dirname(menuTarget.path));
                  closeMenu();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  })
);
