'use client';

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import {
  AlertTriangle,
  Braces,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  File,
  FileCode2,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  Loader2,
  GitBranch,
  Palette,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { getUIPrefs, hasUIPref, saveUIPref } from '@/lib/uiState';
import { InlineCode, BlockCode } from '@/components/chat/CodeBlock';
import LatexDocumentPreview from './LatexDocumentPreview';
import {
  DEFAULT_EDITOR_PANE_CONTENT,
  DEFAULT_EDITOR_PANE_STATE,
  EMBEDDED_TREE_DEFAULT_WIDTH_PX,
  EMBEDDED_TREE_MAX_WIDTH_PX,
  EMBEDDED_TREE_MIN_WIDTH_PX,
  readEditorPaneState,
  writeEditorPaneState,
} from './editorPaneState';
import { panelStyle, pillStyle, btnSecondaryStyle, inputStyle } from '@/chrome/morphology';
import 'highlight.js/styles/github-dark.css';

const DOCUMENT_VIEW_MODES = {
  PREVIEW: 'preview',
  RAW: 'raw',
};

const EMBEDDED_DOCUMENT_MIN_WIDTH_PX = 1344;

const safeHighlight = (options) => {
  const highlighter = rehypeHighlight(options);
  return (tree, file) => {
    try {
      if (highlighter) highlighter(tree, file);
    } catch (e) {
      console.warn('rehype-highlight ignorable preview error:', e.message);
    }
  };
};

function detectLanguage(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js')) return 'javascript';
  if (lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.tex') || lower.endsWith('.latex') || lower.endsWith('.ltx')) return 'latex';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.sh')) return 'shell';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.rs')) return 'rust';
  return 'plaintext';
}

function getFileIconMeta(node) {
  if (node.type === 'directory') {
    return { Icon: null, color: '#58A6FF' };
  }

  const lower = node.name.toLowerCase();
  const path = node.path.toLowerCase();

  if (lower === '.gitignore' || lower.endsWith('.gitignore')) {
    return { Icon: GitBranch, color: '#A371F7' };
  }
  if (lower === '.env' || lower.startsWith('.env.')) return { Icon: Shield, color: '#3FB950' };
  if (path.endsWith('.js') || path.endsWith('.jsx')) return { Icon: FileCode2, color: '#F1E05A' };
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return { Icon: FileType, color: '#3178C6' };
  if (path.endsWith('.css')) return { Icon: Palette, color: '#264DE4' };
  if (path.endsWith('.json')) return { Icon: Braces, color: '#8B949E' };
  if (path.endsWith('.md')) return { Icon: FileText, color: '#8B949E' };
  if (path.endsWith('.tex') || path.endsWith('.latex') || path.endsWith('.ltx')) {
    return { Icon: FileText, color: '#9B7BFF' };
  }

  return { Icon: File, color: '#8B949E' };
}

function normalizePathSegments(path) {
  return String(path || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function buildForcedExpandedPaths(nodes, collector = new Set()) {
  nodes.forEach((node) => {
    if (node.type === 'directory') {
      collector.add(node.path);
      buildForcedExpandedPaths(node.children || [], collector);
    }
  });

  return collector;
}

function filterTreeNodes(nodes, query) {
  const normalizedQuery = String(query || '')
    .trim()
    .toLowerCase();
  if (!normalizedQuery) return nodes;

  return nodes.reduce((result, node) => {
    const matchesSelf = `${node.name} ${node.path}`.toLowerCase().includes(normalizedQuery);

    if (node.type === 'directory') {
      const filteredChildren = filterTreeNodes(node.children || [], normalizedQuery);
      if (matchesSelf) {
        result.push(node);
        return result;
      }

      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }

      return result;
    }

    if (matchesSelf) {
      result.push(node);
    }

    return result;
  }, []);
}

function getScrollableDistance(element) {
  if (!element) return 0;
  return Math.max(0, element.scrollWidth - element.clientWidth);
}

function mapScrollOffset(offset, sourceMax, targetMax) {
  if (!Number.isFinite(offset) || sourceMax <= 0 || targetMax <= 0) {
    return 0;
  }

  return (offset / sourceMax) * targetMax;
}

function clampEmbeddedTreeWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return EMBEDDED_TREE_DEFAULT_WIDTH_PX;
  return Math.min(
    EMBEDDED_TREE_MAX_WIDTH_PX,
    Math.max(EMBEDDED_TREE_MIN_WIDTH_PX, Math.round(numeric))
  );
}

/** Pixel resize for embedded dock — nested % PanelGroups fight the outer dock drag. */
function EmbeddedTreeResizeHandle({ treeWidthPx, onWidthChange }) {
  const onPointerDown = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const handle = event.currentTarget;
      const startX = event.clientX;
      const startWidth = clampEmbeddedTreeWidth(treeWidthPx);
      handle.setPointerCapture?.(event.pointerId);

      const onPointerMove = (moveEvent) => {
        onWidthChange(clampEmbeddedTreeWidth(startWidth + (moveEvent.clientX - startX)));
      };

      const onPointerUp = (upEvent) => {
        handle.releasePointerCapture?.(upEvent.pointerId);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [onWidthChange, treeWidthPx]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize file tree"
      data-testid="embedded-tree-resize-handle"
      onPointerDown={onPointerDown}
      className="relative z-20 w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-[color-mix(in_srgb,var(--accent-primary)_35%,transparent)]"
    >
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--border-subtle)]" />
    </div>
  );
}

function findNodeByPath(nodes, targetPath) {
  for (const node of nodes || []) {
    if (node.path === targetPath) return node;
    if (node.type === 'directory' && Array.isArray(node.children)) {
      const found = findNodeByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function setDirectoryChildren(nodes, dirPath, children) {
  return (nodes || []).map((node) => {
    if (node.path === dirPath && node.type === 'directory') {
      return { ...node, children };
    }
    if (
      node.type === 'directory' &&
      Array.isArray(node.children) &&
      (dirPath === node.path || dirPath.startsWith(`${node.path}/`))
    ) {
      return {
        ...node,
        children: setDirectoryChildren(node.children, dirPath, children),
      };
    }
    return node;
  });
}

function buildFsTreeUrl({ basePath, dir, query, fresh, recursive } = {}) {
  const params = new URLSearchParams();
  if (basePath) params.set('base', basePath);
  if (dir) params.set('dir', dir);
  if (query) params.set('q', query);
  if (fresh) params.set('fresh', '1');
  if (recursive) params.set('recursive', '1');
  const qs = params.toString();
  return qs ? `/api/fs/tree?${qs}` : '/api/fs/tree';
}

const TreeNode = memo(function TreeNode({
  node,
  level,
  expanded,
  onToggle,
  onSelect,
  selectedPath,
  loadingDirs,
}) {
  const isDir = node.type === 'directory';
  const isExpanded = isDir && expanded.has(node.path);
  const isSelected = selectedPath === node.path;
  const indent = level * 12;
  const { Icon: FileIcon, color } = getFileIconMeta(node);
  const isLoadingChildren = isDir && loadingDirs?.has(node.path);
  const childrenLoaded = Array.isArray(node.children);

  return (
    <div>
      <div
        data-path={node.path}
        data-node-type={node.type}
        className={`group flex items-center py-1 px-2 text-sm select-none transition-colors ${isSelected ? 'bg-surface-elevated text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => {
          if (!isDir) onSelect(node.path);
        }}
      >
        <div className="mr-1.5 flex h-5 w-5 items-center justify-center text-text-muted group-hover:text-text-secondary">
          {isDir ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggle(node.path);
              }}
              data-testid={`tree-toggle-${node.path.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.name}`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-transparent text-text-muted transition-colors hover:border-borders-subtle hover:bg-surface-elevated hover:text-text-primary"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.8} />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.8} />
              )}
            </button>
          ) : null}
        </div>
        <div className="mr-1.5 flex h-4 w-4 items-center justify-center text-text-muted group-hover:text-text-secondary">
          {isDir ? (
            isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5" style={{ color: '#58A6FF' }} />
            ) : (
              <Folder className="w-3.5 h-3.5" style={{ color: '#8B949E' }} />
            )
          ) : (
            <FileIcon className="w-3.5 h-3.5" style={{ color }} />
          )}
        </div>
        <button
          type="button"
          className={`min-w-0 flex-1 truncate text-left ${isDir ? 'cursor-default' : 'cursor-pointer'}`}
          onClick={(event) => {
            event.stopPropagation();
            if (!isDir) onSelect(node.path);
          }}
        >
          {node.name}
        </button>
      </div>

      {isDir && isExpanded ? (
        <div>
          {isLoadingChildren || !childrenLoaded ? (
            <div
              className="flex items-center gap-2 py-1 text-[11px] text-text-muted"
              style={{ paddingLeft: `${indent + 28}px` }}
              data-testid={`tree-loading-${node.path.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Cargando…
            </div>
          ) : (
            node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                level={level + 1}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                selectedPath={selectedPath}
                loadingDirs={loadingDirs}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
});

export default function FileExplorerEditorPane({
  project,
  workspaceId = 'default',
  embedded = false,
  onContextChange,
}) {
  const explorerPanelRef = useRef(null);
  const previewScrollRegionRef = useRef(null);
  const documentPreviewRailRef = useRef(null);
  const embeddedHorizontalScrollRef = useRef(null);
  const scrollSyncSourceRef = useRef(null);
  const workspaceSnapshotsRef = useRef(new Map());
  const treeRef = useRef([]);
  const expandedRef = useRef(new Set());
  const loadingDirsRef = useRef(new Set());
  const [tree, setTree] = useState([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState('');
  const [loadingDirs, setLoadingDirs] = useState(() => new Set());
  const [searchTree, setSearchTree] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [expanded, setExpanded] = useState(new Set(DEFAULT_EDITOR_PANE_STATE.expandedPaths));
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(DEFAULT_EDITOR_PANE_STATE.isTreeCollapsed);
  const [selectedPath, setSelectedPath] = useState(DEFAULT_EDITOR_PANE_STATE.selectedPath);
  const [content, setContent] = useState(DEFAULT_EDITOR_PANE_CONTENT);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [markdownViewMode, setMarkdownViewMode] = useState(DOCUMENT_VIEW_MODES.PREVIEW);
  const [latexViewMode, setLatexViewMode] = useState(DOCUMENT_VIEW_MODES.PREVIEW);
  const [searchInputValue, setSearchInputValue] = useState(DEFAULT_EDITOR_PANE_STATE.searchQuery);
  const [embeddedTreeWidthPx, setEmbeddedTreeWidthPx] = useState(
    DEFAULT_EDITOR_PANE_STATE.embeddedTreeWidthPx
  );
  const [embeddedDocumentSurfaceWidth, setEmbeddedDocumentSurfaceWidth] = useState(0);
  const deferredSearchQuery = useDeferredValue(searchInputValue);

  treeRef.current = tree;
  expandedRef.current = expanded;

  const language = useMemo(() => detectLanguage(selectedPath || ''), [selectedPath]);
  const selectedPathLower = useMemo(() => (selectedPath || '').toLowerCase(), [selectedPath]);
  const isMarkdown = useMemo(() => selectedPathLower.endsWith('.md'), [selectedPathLower]);
  const isLatex = useMemo(
    () => Boolean(selectedPathLower.match(/\.(tex|latex|ltx)$/)),
    [selectedPathLower]
  );
  const isPdf = useMemo(() => Boolean(selectedPathLower.match(/\.pdf$/)), [selectedPathLower]);
  const isImage = useMemo(
    () => Boolean(selectedPathLower.match(/\.(png|jpe?g|gif|webp|svg)$/)),
    [selectedPathLower]
  );
  const isOfficeDocument = useMemo(
    () => Boolean(selectedPathLower.match(/\.(docx?|xlsx?)$/)),
    [selectedPathLower]
  );
  const activeDocumentViewMode = isMarkdown ? markdownViewMode : latexViewMode;
  const showPreviewToggle = (isMarkdown || isLatex) && !fileLoading && !fileError;
  const shouldUseEmbeddedDocumentRail =
    embedded &&
    !isImage &&
    !isOfficeDocument &&
    ((isMarkdown && markdownViewMode === DOCUMENT_VIEW_MODES.PREVIEW) ||
      (isLatex && latexViewMode === DOCUMENT_VIEW_MODES.PREVIEW) ||
      isPdf);
  const embeddedDocumentSurfaceClass = shouldUseEmbeddedDocumentRail
    ? 'filesystem-document-surface filesystem-document-surface--embedded'
    : '';
  const markdownShellClassName = shouldUseEmbeddedDocumentRail
    ? 'filesystem-markdown-shell filesystem-markdown-shell--embedded'
    : 'filesystem-markdown-shell';
  const markdownPreviewClassName = shouldUseEmbeddedDocumentRail
    ? 'filesystem-markdown-preview filesystem-markdown-preview--embedded'
    : 'filesystem-markdown-preview';
  const embeddedHorizontalScrollbarSpacerClassName = shouldUseEmbeddedDocumentRail
    ? 'filesystem-document-surface filesystem-document-surface--embedded'
    : 'filesystem-document-surface';
  const resolvedEmbeddedDocumentSurfaceWidth =
    embeddedDocumentSurfaceWidth || EMBEDDED_DOCUMENT_MIN_WIDTH_PX;
  const embeddedDocumentSurfaceStyle = shouldUseEmbeddedDocumentRail
    ? {
        minWidth: `${resolvedEmbeddedDocumentSurfaceWidth}px`,
      }
    : undefined;
  const embeddedScrollbarSpacerStyle = shouldUseEmbeddedDocumentRail
    ? {
        minWidth: `${resolvedEmbeddedDocumentSurfaceWidth}px`,
      }
    : undefined;
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const workspaceStateKey = `${project?.id || 'global'}:${workspaceId || 'default'}`;
  const appliedSearchQuery = searchInputValue.trim();
  const filteredTree = useMemo(() => {
    if (searchTree !== null) return searchTree;
    // While the server search catches up, filter whatever is already loaded.
    return filterTreeNodes(tree, deferredSearchQuery);
  }, [deferredSearchQuery, searchTree, tree]);
  const forcedExpandedPaths = useMemo(
    () => (appliedSearchQuery ? buildForcedExpandedPaths(filteredTree) : new Set()),
    [appliedSearchQuery, filteredTree]
  );
  const visibleExpandedPaths = useMemo(() => {
    if (!appliedSearchQuery) return expanded;
    return new Set([...expanded, ...forcedExpandedPaths]);
  }, [appliedSearchQuery, expanded, forcedExpandedPaths]);
  const currentFileBreadcrumb = useMemo(() => normalizePathSegments(selectedPath), [selectedPath]);
  const showTreeBusy =
    treeLoading || (Boolean(appliedSearchQuery) && searchLoading && searchTree === null);

  const persistLegacyTreeCollapsedPref = useCallback(
    (nextValue) => {
      if (project?.id) {
        saveUIPref(project.id, 'editorFileTreeCollapsed', nextValue);
      }
    },
    [project?.id]
  );

  const markDirLoading = useCallback((dirPath, isLoading) => {
    if (isLoading) loadingDirsRef.current.add(dirPath);
    else loadingDirsRef.current.delete(dirPath);
    setLoadingDirs(new Set(loadingDirsRef.current));
  }, []);

  const fetchDirectoryChildren = useCallback(
    async (dirPath, { fresh = false } = {}) => {
      if (!dirPath) return [];
      if (loadingDirsRef.current.has(dirPath)) return null;

      markDirLoading(dirPath, true);
      try {
        const response = await fetch(
          buildFsTreeUrl({
            basePath: project?.local_path,
            dir: dirPath,
            fresh,
          })
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'No se pudo cargar la carpeta.');
        }
        const children = Array.isArray(data.tree) ? data.tree : [];
        setTree((previous) => setDirectoryChildren(previous, dirPath, children));
        return children;
      } catch (error) {
        setTreeError(error.message || 'No se pudo cargar la carpeta.');
        return [];
      } finally {
        markDirLoading(dirPath, false);
      }
    },
    [markDirLoading, project?.local_path]
  );

  const hydrateExpandedDirectories = useCallback(
    async (rootNodes, expandedPaths) => {
      const ordered = [...expandedPaths].sort(
        (left, right) => left.split('/').length - right.split('/').length
      );
      let current = rootNodes;
      for (const dirPath of ordered) {
        const node = findNodeByPath(current, dirPath);
        if (!node || node.type !== 'directory' || Array.isArray(node.children)) continue;
        const children = await fetchDirectoryChildren(dirPath);
        if (children) {
          current = setDirectoryChildren(current, dirPath, children);
        }
      }
    },
    [fetchDirectoryChildren]
  );

  const loadTree = useCallback(
    async ({ fresh = false } = {}) => {
      setTreeLoading(true);
      setTreeError('');
      try {
        const response = await fetch(
          buildFsTreeUrl({
            basePath: project?.local_path,
            fresh,
          })
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'No se pudo cargar el árbol de archivos.');
        }
        const nextTree = Array.isArray(data.tree) ? data.tree : [];
        setTree(nextTree);
        treeRef.current = nextTree;
        await hydrateExpandedDirectories(nextTree, Array.from(expandedRef.current));
      } catch (error) {
        setTreeError(error.message || 'No se pudo cargar el árbol de archivos.');
      } finally {
        setTreeLoading(false);
      }
    },
    [hydrateExpandedDirectories, project?.local_path]
  );

  const loadFile = useCallback(
    async (path) => {
      if (!path) return;

      setSelectedPath(path);
      setFileLoading(true);
      setFileError('');

      try {
        const baseParam = project?.local_path
          ? `&base=${encodeURIComponent(project.local_path)}`
          : '';
        const lower = path.toLowerCase();
        const isMedia = lower.match(/\.(png|jpe?g|gif|webp|svg|pdf|mp3|mp4|docx?|xlsx?)$/i);

        if (isMedia) {
          setContent(`/api/fs/file?path=${encodeURIComponent(path)}${baseParam}`);
        } else {
          const response = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}${baseParam}`);
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Error al descargar el archivo.');
          }
          const data = await response.json();
          setContent(data.content || '');
        }
      } catch (error) {
        setContent('');
        setFileError(error.message || 'No se pudo leer el archivo.');
      } finally {
        setFileLoading(false);
      }
    },
    [project?.local_path]
  );

  useEffect(() => {
    const inMemorySnapshot = workspaceSnapshotsRef.current.get(workspaceStateKey);
    const persistedSnapshot = readEditorPaneState(storage, project?.id, workspaceId);
    const legacyPrefs = project?.id ? getUIPrefs(project.id) : {};
    const nextState = {
      ...persistedSnapshot,
      ...(inMemorySnapshot || {}),
      expandedPaths:
        inMemorySnapshot?.expandedPaths && inMemorySnapshot.expandedPaths.length > 0
          ? inMemorySnapshot.expandedPaths
          : hasUIPref(project?.id, 'editorExpandedPaths')
            ? legacyPrefs.editorExpandedPaths
            : persistedSnapshot.expandedPaths,
      isTreeCollapsed:
        typeof inMemorySnapshot?.isTreeCollapsed === 'boolean'
          ? inMemorySnapshot.isTreeCollapsed
          : Boolean(legacyPrefs.editorFileTreeCollapsed ?? persistedSnapshot.isTreeCollapsed),
      markdownViewMode:
        inMemorySnapshot?.markdownViewMode ||
        (legacyPrefs.editorMarkdownViewMode === DOCUMENT_VIEW_MODES.RAW
          ? DOCUMENT_VIEW_MODES.RAW
          : persistedSnapshot.markdownViewMode),
      latexViewMode:
        inMemorySnapshot?.latexViewMode ||
        (legacyPrefs.editorLatexViewMode === DOCUMENT_VIEW_MODES.RAW
          ? DOCUMENT_VIEW_MODES.RAW
          : persistedSnapshot.latexViewMode),
    };

    setExpanded(new Set(nextState.expandedPaths || DEFAULT_EDITOR_PANE_STATE.expandedPaths));
    setIsTreeCollapsed(Boolean(nextState.isTreeCollapsed));
    setSelectedPath(nextState.selectedPath || '');
    setContent(inMemorySnapshot?.content || DEFAULT_EDITOR_PANE_CONTENT);
    setFileError(inMemorySnapshot?.fileError || '');
    setFileLoading(false);
    setSearchInputValue(nextState.searchQuery || '');
    setEmbeddedTreeWidthPx(
      clampEmbeddedTreeWidth(
        nextState.embeddedTreeWidthPx ?? DEFAULT_EDITOR_PANE_STATE.embeddedTreeWidthPx
      )
    );
    setMarkdownViewMode(nextState.markdownViewMode || DOCUMENT_VIEW_MODES.PREVIEW);
    setLatexViewMode(nextState.latexViewMode || DOCUMENT_VIEW_MODES.PREVIEW);
  }, [project?.id, storage, workspaceId, workspaceStateKey]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    const query = searchInputValue.trim();
    if (!query) {
      setSearchTree(null);
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    setSearchLoading(true);

    (async () => {
      try {
        const response = await fetch(
          buildFsTreeUrl({
            basePath: project?.local_path,
            query,
          })
        );
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(data?.error || 'No se pudo buscar archivos.');
        }
        setSearchTree(Array.isArray(data.tree) ? data.tree : []);
      } catch (error) {
        if (!cancelled) {
          setTreeError(error.message || 'No se pudo buscar archivos.');
          setSearchTree([]);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project?.local_path, searchInputValue]);

  useEffect(() => {
    const snapshot = {
      expandedPaths: Array.from(expanded),
      isTreeCollapsed,
      selectedPath,
      searchQuery: searchInputValue,
      markdownViewMode,
      latexViewMode,
      content,
      fileError,
    };

    workspaceSnapshotsRef.current.set(workspaceStateKey, snapshot);
  }, [
    content,
    expanded,
    fileError,
    isTreeCollapsed,
    latexViewMode,
    markdownViewMode,
    searchInputValue,
    selectedPath,
    workspaceStateKey,
  ]);

  useEffect(() => {
    writeEditorPaneState(storage, project?.id, workspaceId, {
      expandedPaths: Array.from(expanded),
      isTreeCollapsed,
      selectedPath,
      searchQuery: deferredSearchQuery,
      markdownViewMode,
      latexViewMode,
      embeddedTreeWidthPx,
    });
  }, [
    deferredSearchQuery,
    embeddedTreeWidthPx,
    expanded,
    isTreeCollapsed,
    latexViewMode,
    markdownViewMode,
    project?.id,
    selectedPath,
    storage,
    workspaceId,
  ]);

  const handleEmbeddedTreeWidthChange = useCallback((nextWidth) => {
    setEmbeddedTreeWidthPx(clampEmbeddedTreeWidth(nextWidth));
  }, []);

  useEffect(() => {
    onContextChange?.({
      projectPath: project?.local_path || '',
      currentFilePath: selectedPath || '',
      breadcrumb: currentFileBreadcrumb,
    });
  }, [currentFileBreadcrumb, onContextChange, project?.local_path, selectedPath]);

  const toggleNode = useCallback(
    (path) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
          const node = findNodeByPath(treeRef.current, path);
          if (node?.type === 'directory' && !Array.isArray(node.children)) {
            void fetchDirectoryChildren(path);
          }
        }

        if (project?.id) {
          saveUIPref(project.id, 'editorExpandedPaths', Array.from(next));
        }

        return next;
      });
    },
    [fetchDirectoryChildren, project?.id]
  );

  const handleDocumentViewModeChange = useCallback(
    (mode) => {
      if (isMarkdown) {
        setMarkdownViewMode(mode);
        if (project?.id) {
          saveUIPref(project.id, 'editorMarkdownViewMode', mode);
        }
      } else if (isLatex) {
        setLatexViewMode(mode);
        if (project?.id) {
          saveUIPref(project.id, 'editorLatexViewMode', mode);
        }
      }
    },
    [isLatex, isMarkdown, project?.id]
  );

  useEffect(() => {
    const panel = explorerPanelRef.current;
    if (!panel) return;

    if (isTreeCollapsed) {
      panel.collapse();
    } else {
      panel.expand();
    }
  }, [isTreeCollapsed]);

  const handleTreeToggle = useCallback(() => {
    const nextValue = !isTreeCollapsed;
    setIsTreeCollapsed(nextValue);
    persistLegacyTreeCollapsedPref(nextValue);
  }, [isTreeCollapsed, persistLegacyTreeCollapsedPref]);

  const clearSearch = useCallback(() => {
    setSearchInputValue('');
  }, []);

  const handleSearchQueryChange = useCallback((event) => {
    const nextValue = event.target.value;
    setSearchInputValue((previousValue) =>
      previousValue === nextValue ? previousValue : nextValue
    );
  }, []);

  const renderedTree = useMemo(
    () =>
      filteredTree.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          level={0}
          expanded={visibleExpandedPaths}
          onToggle={toggleNode}
          onSelect={loadFile}
          selectedPath={selectedPath}
          loadingDirs={loadingDirs}
        />
      )),
    [filteredTree, loadFile, loadingDirs, selectedPath, toggleNode, visibleExpandedPaths]
  );

  const measureEmbeddedDocumentSurfaceWidth = useCallback(() => {
    if (!shouldUseEmbeddedDocumentRail) return;

    const previewRegion = previewScrollRegionRef.current;
    const previewRail = documentPreviewRailRef.current;
    if (!previewRegion && !previewRail) return;

    const nextWidth = Math.max(
      EMBEDDED_DOCUMENT_MIN_WIDTH_PX,
      Math.ceil(previewRegion?.scrollWidth || 0),
      Math.ceil(previewRail?.scrollWidth || 0),
      Math.ceil(previewRail?.getBoundingClientRect?.().width || 0)
    );

    setEmbeddedDocumentSurfaceWidth((previousWidth) =>
      Math.abs(previousWidth - nextWidth) < 1 ? previousWidth : nextWidth
    );
  }, [shouldUseEmbeddedDocumentRail]);

  const syncBottomScrollbarToPreview = useCallback((previewScrollLeft) => {
    const previewRegion = previewScrollRegionRef.current;
    const bottomScrollbar = embeddedHorizontalScrollRef.current;
    if (!previewRegion || !bottomScrollbar) return;

    const previewMaxScrollLeft = getScrollableDistance(previewRegion);
    const bottomMaxScrollLeft = getScrollableDistance(bottomScrollbar);
    const nextScrollLeft = mapScrollOffset(
      previewScrollLeft,
      previewMaxScrollLeft,
      bottomMaxScrollLeft
    );

    if (Math.abs(bottomScrollbar.scrollLeft - nextScrollLeft) < 1) return;
    bottomScrollbar.scrollLeft = nextScrollLeft;
  }, []);

  const syncPreviewToBottomScrollbar = useCallback((bottomScrollLeft) => {
    const previewRegion = previewScrollRegionRef.current;
    const bottomScrollbar = embeddedHorizontalScrollRef.current;
    if (!previewRegion || !bottomScrollbar) return;

    const bottomMaxScrollLeft = getScrollableDistance(bottomScrollbar);
    const previewMaxScrollLeft = getScrollableDistance(previewRegion);
    const nextScrollLeft = mapScrollOffset(
      bottomScrollLeft,
      bottomMaxScrollLeft,
      previewMaxScrollLeft
    );

    if (Math.abs(previewRegion.scrollLeft - nextScrollLeft) < 1) return;
    previewRegion.scrollLeft = nextScrollLeft;
  }, []);

  const syncEmbeddedHorizontalScrollState = useCallback(() => {
    if (!shouldUseEmbeddedDocumentRail) return;

    const previewRegion = previewScrollRegionRef.current;
    const bottomScrollbar = embeddedHorizontalScrollRef.current;
    if (!previewRegion || !bottomScrollbar) return;

    const previewMaxScrollLeft = getScrollableDistance(previewRegion);
    const clampedPreviewScrollLeft = Math.min(previewRegion.scrollLeft, previewMaxScrollLeft);

    if (Math.abs(previewRegion.scrollLeft - clampedPreviewScrollLeft) >= 1) {
      previewRegion.scrollLeft = clampedPreviewScrollLeft;
    }

    syncBottomScrollbarToPreview(clampedPreviewScrollLeft);
  }, [shouldUseEmbeddedDocumentRail, syncBottomScrollbarToPreview]);

  const releaseScrollSyncLock = useCallback((source) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      scrollSyncSourceRef.current = null;
      return;
    }

    window.requestAnimationFrame(() => {
      if (scrollSyncSourceRef.current === source) {
        scrollSyncSourceRef.current = null;
      }
    });
  }, []);

  const handlePreviewRegionScroll = useCallback(
    (event) => {
      if (!shouldUseEmbeddedDocumentRail) return;

      if (scrollSyncSourceRef.current === 'bottom-scrollbar') {
        scrollSyncSourceRef.current = null;
        return;
      }

      const nextScrollLeft = event.currentTarget.scrollLeft;
      scrollSyncSourceRef.current = 'preview';
      syncBottomScrollbarToPreview(nextScrollLeft);
      releaseScrollSyncLock('preview');
    },
    [releaseScrollSyncLock, shouldUseEmbeddedDocumentRail, syncBottomScrollbarToPreview]
  );

  const handleBottomScrollbarScroll = useCallback(
    (event) => {
      if (!shouldUseEmbeddedDocumentRail) return;

      if (scrollSyncSourceRef.current === 'preview') {
        scrollSyncSourceRef.current = null;
        return;
      }

      const nextScrollLeft = event.currentTarget.scrollLeft;
      scrollSyncSourceRef.current = 'bottom-scrollbar';
      syncPreviewToBottomScrollbar(nextScrollLeft);
      releaseScrollSyncLock('bottom-scrollbar');
    },
    [releaseScrollSyncLock, shouldUseEmbeddedDocumentRail, syncPreviewToBottomScrollbar]
  );

  const handleEmbeddedHorizontalWheel = useCallback(
    (event) => {
      if (!shouldUseEmbeddedDocumentRail) return;

      const previewRegion = previewScrollRegionRef.current;
      const bottomScrollbar = embeddedHorizontalScrollRef.current;
      if (!previewRegion || !bottomScrollbar) return;

      const isBottomScrollbar = event.currentTarget === bottomScrollbar;
      const hasHorizontalIntent =
        Math.abs(event.deltaX) > 0.5 ||
        event.shiftKey ||
        (isBottomScrollbar && Math.abs(event.deltaY) > 0.5);

      if (!hasHorizontalIntent) return;

      const horizontalDelta = Math.abs(event.deltaX) > 0.5 ? event.deltaX : event.deltaY;
      if (!Number.isFinite(horizontalDelta) || horizontalDelta === 0) return;

      const scrollTarget = isBottomScrollbar ? bottomScrollbar : previewRegion;
      scrollTarget.scrollLeft += horizontalDelta;

      if (isBottomScrollbar) {
        syncPreviewToBottomScrollbar(scrollTarget.scrollLeft);
      } else {
        syncBottomScrollbarToPreview(scrollTarget.scrollLeft);
      }

      event.preventDefault();
    },
    [shouldUseEmbeddedDocumentRail, syncBottomScrollbarToPreview, syncPreviewToBottomScrollbar]
  );

  useEffect(() => {
    if (!shouldUseEmbeddedDocumentRail) {
      setEmbeddedDocumentSurfaceWidth(0);
      return undefined;
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      const frame = window.requestAnimationFrame(() => {
        measureEmbeddedDocumentSurfaceWidth();
        syncEmbeddedHorizontalScrollState();
      });

      return () => {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(frame);
        }
      };
    }

    measureEmbeddedDocumentSurfaceWidth();
    syncEmbeddedHorizontalScrollState();
    return undefined;
  }, [
    content,
    measureEmbeddedDocumentSurfaceWidth,
    selectedPath,
    shouldUseEmbeddedDocumentRail,
    syncEmbeddedHorizontalScrollState,
  ]);

  useEffect(() => {
    if (!shouldUseEmbeddedDocumentRail || typeof window === 'undefined') return undefined;

    const previewRegion = previewScrollRegionRef.current;
    const previewRail = documentPreviewRailRef.current;
    const bottomScrollbar = embeddedHorizontalScrollRef.current;
    if (
      !previewRegion ||
      !previewRail ||
      !bottomScrollbar ||
      typeof ResizeObserver === 'undefined'
    ) {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      measureEmbeddedDocumentSurfaceWidth();
      syncEmbeddedHorizontalScrollState();
    });

    resizeObserver.observe(previewRegion);
    resizeObserver.observe(previewRail);
    resizeObserver.observe(bottomScrollbar);

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    measureEmbeddedDocumentSurfaceWidth,
    shouldUseEmbeddedDocumentRail,
    syncEmbeddedHorizontalScrollState,
  ]);

  const treeBrowser = (
    <>
      <div className="flex-shrink-0 border-b border-borders-subtle px-2 py-2">
        <div
          className="flex items-center gap-2 border border-borders-subtle px-2.5 py-2"
          style={inputStyle()}
        >
          <input
            type="search"
            value={searchInputValue}
            onInput={handleSearchQueryChange}
            onChange={handleSearchQueryChange}
            placeholder="Search files or paths"
            className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
            data-testid="editor-tree-search-input"
            aria-label="Search files"
          />
          {searchInputValue ? (
            <button
              type="button"
              onClick={clearSearch}
              className="inline-flex h-5 items-center rounded-md px-1.5 text-[11px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
              aria-label="Clear file search"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        data-testid="editor-tree-scroll-region"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        {showTreeBusy ? (
          <div className="space-y-3 p-2" data-testid="editor-tree-loading">
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-primary" />
              {appliedSearchQuery ? 'Buscando archivos…' : 'Cargando archivos del workspace…'}
            </div>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="h-3.5 w-3.5 animate-pulse rounded-sm"
                  style={{
                    background: 'color-mix(in srgb, var(--text-muted) 28%, transparent)',
                  }}
                />
                <div
                  className={`h-3 animate-pulse rounded ${i % 2 === 0 ? 'w-28' : 'w-20'}`}
                  style={{
                    background: 'color-mix(in srgb, var(--text-muted) 22%, transparent)',
                  }}
                />
              </div>
            ))}
          </div>
        ) : treeError ? (
          <div className="text-xs text-danger p-2 rounded-md border border-[#F778BA33] bg-[#F778BA11]">
            {treeError}
          </div>
        ) : filteredTree.length === 0 ? (
          appliedSearchQuery ? (
            <div
              className="rounded-md border border-borders-subtle bg-surface-elevated px-3 py-2 text-xs text-text-muted"
              data-testid="editor-tree-empty-search"
            >
              No files match “{appliedSearchQuery}”.
            </div>
          ) : (
            <div className="text-xs text-text-muted p-2">No se encontraron archivos.</div>
          )
        ) : (
          renderedTree
        )}
      </div>
    </>
  );

  const previewSection = (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-borders-subtle bg-surface-app flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2 flex-1">
          <button
            type="button"
            onClick={handleTreeToggle}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-borders-subtle text-text-muted transition-colors hover:text-text-primary cursor-pointer flex-shrink-0"
            title={isTreeCollapsed ? 'Mostrar árbol de archivos' : 'Ocultar árbol de archivos'}
            aria-label={isTreeCollapsed ? 'Mostrar árbol de archivos' : 'Ocultar árbol de archivos'}
            data-testid="editor-tree-toggle"
            style={btnSecondaryStyle({ size: 'xs' })}
          >
            {isTreeCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.8} />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.8} />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[11px] font-medium text-text-primary"
              title={selectedPath || 'Ningún archivo seleccionado'}
            >
              {selectedPath || 'Ningún archivo seleccionado'}
            </p>
            <p
              className="truncate text-[10px] uppercase tracking-[0.14em] text-text-muted"
              title={currentFileBreadcrumb.join(' / ') || project?.local_path || ''}
              data-testid="editor-current-breadcrumb"
            >
              {currentFileBreadcrumb.length > 0
                ? currentFileBreadcrumb.join(' / ')
                : project?.local_path || 'Workspace context'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {showPreviewToggle && (
            <div
              className="inline-flex rounded-md border border-borders-subtle p-0.5"
              style={{ background: 'var(--chrome-control-fill)' }}
            >
              <button
                type="button"
                onClick={() => handleDocumentViewModeChange(DOCUMENT_VIEW_MODES.PREVIEW)}
                className={`px-2.5 py-1 text-[11px] rounded-sm transition-colors cursor-pointer ${activeDocumentViewMode === DOCUMENT_VIEW_MODES.PREVIEW ? 'bg-accent-primary text-black' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => handleDocumentViewModeChange(DOCUMENT_VIEW_MODES.RAW)}
                className={`px-2.5 py-1 text-[11px] rounded-sm transition-colors cursor-pointer ${activeDocumentViewMode === DOCUMENT_VIEW_MODES.RAW ? 'bg-accent-primary text-black' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
              >
                Raw
              </button>
            </div>
          )}
          {fileLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-primary" />}
        </div>
      </div>

      {!selectedPath ? (
        <div
          className="flex h-full items-center justify-center px-6 text-center"
          data-testid="editor-empty-state"
          style={{ background: 'var(--chrome-panel-fill)' }}
        >
          <div className="max-w-sm space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-borders-subtle bg-surface-elevated text-text-muted">
              <FileText className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-text-primary">
                Select a file to start browsing
              </p>
              <p className="text-xs text-text-muted">
                The file tree and the preview area now scroll independently inside this panel.
              </p>
            </div>
          </div>
        </div>
      ) : fileError ? (
        <div className="m-4 p-4 border border-[#F778BA33] bg-[#F778BA11] text-danger text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{fileError}</span>
        </div>
      ) : (
        <div
          ref={previewScrollRegionRef}
          onScroll={shouldUseEmbeddedDocumentRail ? handlePreviewRegionScroll : undefined}
          onWheel={shouldUseEmbeddedDocumentRail ? handleEmbeddedHorizontalWheel : undefined}
          className={`relative flex-1 min-h-0 overflow-y-auto overscroll-contain ${shouldUseEmbeddedDocumentRail ? 'overflow-x-auto filesystem-document-viewport--embedded' : ''}`}
          data-testid="editor-preview-scroll-region"
          style={{ background: 'var(--chrome-panel-fill)' }}
        >
          {isPdf ? (
            <div
              ref={documentPreviewRailRef}
              className={`h-full ${embeddedDocumentSurfaceClass}`}
              style={embeddedDocumentSurfaceStyle}
              data-testid="editor-document-preview-rail"
            >
              <iframe
                src={content}
                className="block h-full w-full border-none relative z-10"
                style={{ background: 'var(--chrome-panel-fill)' }}
                title="PDF Viewer"
              />
            </div>
          ) : isImage ? (
            <div className="flex items-center justify-center h-full bg-surface-base/50 p-8 overflow-auto">
              <img
                src={content}
                className="max-w-full max-h-full object-contain shadow-xl rounded pointer-events-none"
                alt={selectedPath}
              />
            </div>
          ) : isOfficeDocument ? (
            <div className="flex flex-col items-center justify-center h-full bg-surface-base text-text-secondary gap-4 p-8 text-center">
              <FileText className="w-16 h-16 opacity-30" />
              <h3 className="text-text-primary text-lg font-medium">Archivo Office Detectado</h3>
              <p className="text-sm">
                Para ver documentos Word o Excel fluidamente, descárgalo o ábrelo en sus editores
                nativos.
              </p>
              <a
                href={content}
                download
                target="_blank"
                rel="noreferrer"
                className="mt-4 px-4 py-2 bg-surface-elevated hover:bg-surface-hover rounded-md text-sm transition-colors border border-borders-subtle flex items-center gap-2 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" /> Descargar / Abrir Nativo
              </a>
            </div>
          ) : isMarkdown && markdownViewMode === DOCUMENT_VIEW_MODES.PREVIEW ? (
            fileLoading ? (
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-t-[var(--accent-primary)] rounded-full animate-spin" />
              </div>
            ) : (
              <div
                ref={documentPreviewRailRef}
                className={`h-full ${embeddedDocumentSurfaceClass}`}
                style={embeddedDocumentSurfaceStyle}
                data-testid="editor-document-preview-rail"
              >
                <div className={markdownShellClassName}>
                  <div className={markdownPreviewClassName}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[[safeHighlight, { ignoreMissing: true }]]}
                      components={{
                        code: InlineCode,
                        pre: BlockCode,
                      }}
                    >
                      {content || ''}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )
          ) : isLatex && latexViewMode === DOCUMENT_VIEW_MODES.PREVIEW ? (
            fileLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-t-[var(--accent-primary)] rounded-full animate-spin" />
              </div>
            ) : (
              <div
                ref={documentPreviewRailRef}
                className={`h-full ${embeddedDocumentSurfaceClass}`}
                style={embeddedDocumentSurfaceStyle}
                data-testid="editor-document-preview-rail"
              >
                <LatexDocumentPreview content={content} filePath={selectedPath} />
              </div>
            )
          ) : (
            <div className="h-full min-h-0 min-w-0 w-full overflow-hidden">
              <Editor
                height="100%"
                language={language}
                theme="vs-dark"
                value={content}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: 'Consolas, "Courier New", monospace',
                  wordWrap: 'on',
                  wrappingIndent: 'indent',
                  scrollBeyondLastLine: false,
                  padding: { top: 16 },
                }}
                loading={
                  <div
                    className="flex h-full w-full flex-col"
                    style={{
                      background: 'var(--chrome-panel-fill)',
                      borderTop: 'var(--chrome-border-width) solid var(--chrome-border-color)',
                    }}
                  >
                    <div
                      className="flex items-center justify-between px-4 py-3"
                      style={{
                        background: 'var(--chrome-panel-fill-emphasis)',
                        borderBottom: 'var(--chrome-border-width) solid var(--chrome-border-color)',
                        boxShadow: 'var(--chrome-shadow-control)',
                      }}
                    >
                      <div className="h-3 w-28" style={pillStyle()} />
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-12" style={pillStyle()} />
                        <Loader2 className="w-4 h-4 animate-spin text-accent-primary" />
                      </div>
                    </div>
                    <div className="flex-1 p-4" style={{ background: 'var(--chrome-panel-fill)' }}>
                      <div
                        className="h-full w-full p-4"
                        style={{
                          ...panelStyle(),
                          borderRadius: 'var(--chrome-radius-panel)',
                          boxShadow: 'var(--chrome-shadow-panel)',
                        }}
                      >
                        <div className="space-y-3">
                          <div className="h-3 w-11/12" style={pillStyle()} />
                          <div className="h-3 w-10/12" style={pillStyle()} />
                          <div className="h-3 w-9/12" style={pillStyle()} />
                          <div className="h-3 w-7/12" style={pillStyle()} />
                        </div>
                      </div>
                    </div>
                  </div>
                }
              />
            </div>
          )}
        </div>
      )}

      {shouldUseEmbeddedDocumentRail ? (
        <div
          ref={embeddedHorizontalScrollRef}
          onScroll={handleBottomScrollbarScroll}
          onWheel={handleEmbeddedHorizontalWheel}
          className="filesystem-embedded-horizontal-scrollbar"
          data-testid="editor-preview-horizontal-scrollbar"
          aria-label="Document horizontal scroll"
        >
          <div
            className={`${embeddedHorizontalScrollbarSpacerClassName} h-px`}
            style={embeddedScrollbarSpacerStyle}
            aria-hidden="true"
          />
        </div>
      ) : null}
    </section>
  );

  return (
    <div
      data-testid="shared-editor-pane"
      className={`flex h-full w-full min-h-0 flex-col overflow-hidden ${embedded ? '' : 'flex-1'}`}
      style={{ background: embedded ? 'var(--chrome-panel-fill)' : undefined }}
    >
      <div
        className="px-4 py-2 border-b border-borders-subtle flex items-center justify-between gap-3"
        style={{
          background: 'var(--chrome-panel-fill-emphasis)',
          borderBottomColor: 'var(--chrome-border-color)',
        }}
      >
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-semibold">
            Workspace files
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadTree({ fresh: true })}
          className="text-text-muted hover:text-text-primary transition-colors p-1.5 rounded-md hover:bg-surface-elevated cursor-pointer"
          title="Recargar árbol de archivos"
          aria-label="Recargar árbol de archivos"
          style={btnSecondaryStyle({ size: 'xs' })}
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div
        className="flex-1 min-h-0 min-w-0 overflow-hidden"
        data-embedded={embedded ? 'true' : 'false'}
      >
        {embedded ? (
          <div className="flex h-full min-h-0 min-w-0" data-testid="embedded-editor-split">
            {!isTreeCollapsed ? (
              <>
                <aside
                  className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-borders-subtle bg-surface-app"
                  data-testid="editor-tree-panel"
                  style={{
                    width: `${embeddedTreeWidthPx}px`,
                    minWidth: `${EMBEDDED_TREE_MIN_WIDTH_PX}px`,
                    maxWidth: `${EMBEDDED_TREE_MAX_WIDTH_PX}px`,
                  }}
                >
                  {treeBrowser}
                </aside>
                <EmbeddedTreeResizeHandle
                  treeWidthPx={embeddedTreeWidthPx}
                  onWidthChange={handleEmbeddedTreeWidthChange}
                />
              </>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {previewSection}
            </div>
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 min-w-0">
            <ResizablePanel
              ref={explorerPanelRef}
              id="standalone-fs-tree"
              defaultSize={26}
              minSize={18}
              maxSize={40}
              collapsible
              collapsedSize={0}
              onCollapse={() => {
                setIsTreeCollapsed(true);
                persistLegacyTreeCollapsedPref(true);
              }}
              onExpand={() => {
                setIsTreeCollapsed(false);
                persistLegacyTreeCollapsedPref(false);
              }}
              className="flex h-full min-h-0 min-w-0 flex-col"
              style={{ overflow: 'hidden' }}
            >
              {!isTreeCollapsed ? (
                <aside
                  className="flex h-full min-h-0 flex-col overflow-hidden border-r border-borders-subtle bg-surface-app"
                  data-testid="editor-tree-panel"
                >
                  {treeBrowser}
                </aside>
              ) : (
                <div className="h-full w-0 overflow-hidden" aria-hidden="true" />
              )}
            </ResizablePanel>

            {!isTreeCollapsed && (
              <ResizableHandle
                className="bg-surface-elevated"
                onPointerDown={(event) => event.stopPropagation()}
              />
            )}

            <ResizablePanel
              id="standalone-fs-preview"
              defaultSize={74}
              minSize={45}
              className="flex h-full min-h-0 min-w-0 flex-col"
              style={{ overflow: 'hidden' }}
            >
              {previewSection}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
