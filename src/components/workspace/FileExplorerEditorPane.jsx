'use client';

import ReactMarkdown from 'react-markdown';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import LatexDocumentPreview from './LatexDocumentPreview';
import { FileExplorer } from './explorer/FileExplorer';
import { SourceControlPanel } from './explorer/SourceControlPanel';
import { CodeFileView } from './explorer/CodeFileView';
import { GitDiffView } from './explorer/GitDiffView';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { getUIPrefs, hasUIPref, saveUIPref } from '@/lib/uiState';
import { InlineCode, BlockCode } from '@/components/chat/CodeBlock';
import { isCodeDiffablePath } from './explorer/codeLanguages';
import {
  DEFAULT_EDITOR_PANE_CONTENT,
  DEFAULT_EDITOR_PANE_STATE,
  EMBEDDED_TREE_DEFAULT_WIDTH_PX,
  EMBEDDED_TREE_MAX_WIDTH_PX,
  EMBEDDED_TREE_MIN_WIDTH_PX,
  readEditorPaneState,
  writeEditorPaneState,
} from './editorPaneState';
import { btnSecondaryStyle } from '@/chrome/morphology';
import {
  OPEN_FILE_EVENT,
  isValidOpenFileEvent,
  consumePendingOpenFile,
} from '@/lib/workspace/openFileEvent';
import { resolveOpenFileTarget } from '@/lib/terminal/resolveOpenFileTarget';
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

function normalizePathSegments(path) {
  return String(path || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
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

export default function FileExplorerEditorPane({
  project,
  workspaceId = 'default',
  embedded = false,
  onContextChange,
}) {
  const explorerPanelRef = useRef(null);
  const fileExplorerRef = useRef(null);
  const previewScrollRegionRef = useRef(null);
  const documentPreviewRailRef = useRef(null);
  const embeddedHorizontalScrollRef = useRef(null);
  const scrollSyncSourceRef = useRef(null);
  const workspaceSnapshotsRef = useRef(new Map());
  const expandedRef = useRef(new Set());
  const [expanded, setExpanded] = useState(new Set(DEFAULT_EDITOR_PANE_STATE.expandedPaths));
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(DEFAULT_EDITOR_PANE_STATE.isTreeCollapsed);
  const [selectedPath, setSelectedPath] = useState(DEFAULT_EDITOR_PANE_STATE.selectedPath);
  const [content, setContent] = useState(DEFAULT_EDITOR_PANE_CONTENT);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [markdownViewMode, setMarkdownViewMode] = useState(DOCUMENT_VIEW_MODES.PREVIEW);
  const [latexViewMode, setLatexViewMode] = useState(DOCUMENT_VIEW_MODES.PREVIEW);
  const [embeddedTreeWidthPx, setEmbeddedTreeWidthPx] = useState(
    DEFAULT_EDITOR_PANE_STATE.embeddedTreeWidthPx
  );
  const [embeddedDocumentSurfaceWidth, setEmbeddedDocumentSurfaceWidth] = useState(0);
  const [explorerSideTab, setExplorerSideTab] = useState('files');
  /** 'file' = content / document preview; 'diff' = HEAD vs working (code only). */
  const [editorSurface, setEditorSurface] = useState('file');
  const [diffStaged, setDiffStaged] = useState(false);
  const workspaceStateKey = `${project?.id || 'global'}:${workspaceId || 'default'}`;

  expandedRef.current = expanded;
  const deferredExpanded = useDeferredValue([...expanded]);

  // Sync seed so FileExplorer can mount immediately (no treeSeed gate).
  const initialExpandedForKey = useMemo(() => {
    if (typeof window === 'undefined') {
      return [...DEFAULT_EDITOR_PANE_STATE.expandedPaths];
    }
    const persisted = readEditorPaneState(window.localStorage, project?.id, workspaceId);
    const legacyPrefs = project?.id ? getUIPrefs(project.id) : {};
    if (
      hasUIPref(project?.id, 'editorExpandedPaths') &&
      Array.isArray(legacyPrefs.editorExpandedPaths)
    ) {
      return legacyPrefs.editorExpandedPaths;
    }
    return persisted.expandedPaths || [...DEFAULT_EDITOR_PANE_STATE.expandedPaths];
  }, [project?.id, workspaceId, workspaceStateKey]);

  const selectedPathLower = useMemo(() => (selectedPath || '').toLowerCase(), [selectedPath]);
  const canShowCodeDiff = useMemo(() => isCodeDiffablePath(selectedPath || ''), [selectedPath]);
  const isMarkdown = useMemo(
    () => selectedPathLower.endsWith('.md') || selectedPathLower.endsWith('.mdx'),
    [selectedPathLower]
  );
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
  // ponytail: collapsed tree should fill the slot — skip the wide embedded rail clamp
  const shouldUseEmbeddedDocumentRail =
    embedded &&
    !isTreeCollapsed &&
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
  const currentFileBreadcrumb = useMemo(() => normalizePathSegments(selectedPath), [selectedPath]);

  const persistLegacyTreeCollapsedPref = useCallback(
    (nextValue) => {
      if (project?.id) {
        saveUIPref(project.id, 'editorFileTreeCollapsed', nextValue);
      }
    },
    [project?.id]
  );

  const handleExpandedChange = useCallback(
    (paths) => {
      const next = new Set(paths || []);
      setExpanded(next);
      if (project?.id) {
        saveUIPref(project.id, 'editorExpandedPaths', Array.from(next));
      }
    },
    [project?.id]
  );

  const loadFile = useCallback(
    async (path, options = {}) => {
      if (!path) return;

      const preferDiff = Boolean(options.preferDiff) && isCodeDiffablePath(path);
      setSelectedPath(path);
      setDiffStaged(Boolean(options.staged));
      setEditorSurface(preferDiff ? 'diff' : 'file');
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

  const openFromChanges = useCallback(
    (path, meta = {}) => {
      void loadFile(path, {
        preferDiff: isCodeDiffablePath(path),
        staged: Boolean(meta.staged),
      });
    },
    [loadFile]
  );

  const openExternalPath = useCallback(
    (detail) => {
      if (!isValidOpenFileEvent(detail)) return;
      // Drop pending entries so remount does not re-open a stale path.
      for (const key of [
        workspaceId,
        `project:${workspaceId}`,
        project?.id && `project:${project.id}`,
      ]
        .filter(Boolean)
        .map(String)) {
        consumePendingOpenFile(key);
      }
      const resolved = resolveOpenFileTarget({
        rawPath: detail.path,
        projectRoot: project?.local_path || detail.base || null,
        cwd: detail.base || project?.local_path || null,
      });
      if (!resolved.ok || !resolved.openPath) return;
      // Expand ancestor folders so the tree highlights the file.
      const posix = String(resolved.openPath).replace(/\\/g, '/');
      const parts = posix.split('/').filter(Boolean);
      if (parts.length > 1) {
        setExpanded((prev) => {
          const next = new Set(prev);
          let acc = '';
          for (let i = 0; i < parts.length - 1; i += 1) {
            acc = acc ? `${acc}/${parts[i]}` : parts[i];
            next.add(acc);
          }
          return next;
        });
      }
      void loadFile(resolved.openPath);
    },
    [loadFile, project?.id, project?.local_path, workspaceId]
  );

  // Agent terminal (and other) open-file requests → load in this Files pane.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const tryConsumePending = () => {
      const keys = [workspaceId, `project:${workspaceId}`, project?.id && `project:${project.id}`]
        .filter(Boolean)
        .map(String);
      for (const key of keys) {
        const pending = consumePendingOpenFile(key);
        if (pending) {
          openExternalPath(pending);
          return;
        }
      }
    };

    tryConsumePending();
    // Late mount after splitWithKind('files'): pending was reserved first.
    const t = window.setTimeout(tryConsumePending, 0);

    const onOpenFile = (event) => {
      openExternalPath(event?.detail);
    };
    window.addEventListener(OPEN_FILE_EVENT, onOpenFile);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(OPEN_FILE_EVENT, onOpenFile);
    };
  }, [openExternalPath, project?.id, workspaceId]);

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

    const nextExpanded = nextState.expandedPaths || DEFAULT_EDITOR_PANE_STATE.expandedPaths;
    setExpanded(new Set(nextExpanded));
    setIsTreeCollapsed(Boolean(nextState.isTreeCollapsed));
    setSelectedPath(nextState.selectedPath || '');
    setContent(inMemorySnapshot?.content || DEFAULT_EDITOR_PANE_CONTENT);
    setFileError(inMemorySnapshot?.fileError || '');
    setFileLoading(false);
    setEmbeddedTreeWidthPx(
      clampEmbeddedTreeWidth(
        nextState.embeddedTreeWidthPx ?? DEFAULT_EDITOR_PANE_STATE.embeddedTreeWidthPx
      )
    );
    setMarkdownViewMode(nextState.markdownViewMode || DOCUMENT_VIEW_MODES.PREVIEW);
    setLatexViewMode(nextState.latexViewMode || DOCUMENT_VIEW_MODES.PREVIEW);
  }, [project?.id, storage, workspaceId, workspaceStateKey]);

  useEffect(() => {
    const snapshot = {
      expandedPaths: Array.from(expanded),
      isTreeCollapsed,
      selectedPath,
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
    selectedPath,
    workspaceStateKey,
  ]);

  useEffect(() => {
    writeEditorPaneState(storage, project?.id, workspaceId, {
      expandedPaths: deferredExpanded,
      isTreeCollapsed,
      selectedPath,
      markdownViewMode,
      latexViewMode,
      embeddedTreeWidthPx,
    });
  }, [
    deferredExpanded,
    embeddedTreeWidthPx,
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
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex flex-shrink-0 gap-1 border-b border-borders-subtle px-2 py-1.5"
        data-testid="explorer-side-tabs"
      >
        <button
          type="button"
          data-testid="explorer-tab-files"
          className={[
            'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            explorerSideTab === 'files'
              ? 'bg-surface-elevated text-text-primary'
              : 'text-text-muted hover:text-text-primary',
          ].join(' ')}
          onClick={() => setExplorerSideTab('files')}
        >
          Files
        </button>
        <button
          type="button"
          data-testid="explorer-tab-changes"
          className={[
            'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
            explorerSideTab === 'changes'
              ? 'bg-surface-elevated text-text-primary'
              : 'text-text-muted hover:text-text-primary',
          ].join(' ')}
          onClick={() => setExplorerSideTab('changes')}
        >
          Changes
        </button>
      </div>
      <div key={explorerSideTab} className="dh-panel-in min-h-0 flex-1">
        {explorerSideTab === 'changes' ? (
          <SourceControlPanel basePath={project?.local_path || null} onOpenFile={openFromChanges} />
        ) : (
          <FileExplorer
            key={workspaceStateKey}
            ref={fileExplorerRef}
            basePath={project?.local_path || null}
            activeFilePath={selectedPath || null}
            initialExpanded={initialExpandedForKey}
            onOpenFile={loadFile}
            onExpandedChange={handleExpandedChange}
            onPathRenamed={(from, to) => {
              if (selectedPath === from || (selectedPath && selectedPath.startsWith(from + '/'))) {
                setSelectedPath(selectedPath === from ? to : to + selectedPath.slice(from.length));
              }
            }}
            onPathDeleted={(path) => {
              if (selectedPath === path || (selectedPath && selectedPath.startsWith(path + '/'))) {
                setSelectedPath('');
                setContent(DEFAULT_EDITOR_PANE_CONTENT);
              }
            }}
          />
        )}
      </div>
    </div>
  );

  const previewSection = (
    <section className="flex flex-1 min-h-0 flex-col overflow-hidden">
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
              data-testid="editor-document-view-toggle"
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
          {canShowCodeDiff && !fileLoading && !fileError && selectedPath ? (
            <div
              className="inline-flex rounded-md border border-borders-subtle p-0.5"
              style={{ background: 'var(--chrome-control-fill)' }}
              data-testid="editor-code-surface-toggle"
            >
              <button
                type="button"
                onClick={() => setEditorSurface('file')}
                className={`px-2.5 py-1 text-[11px] rounded-sm transition-colors cursor-pointer ${editorSurface === 'file' ? 'bg-accent-primary text-black' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
              >
                Code
              </button>
              <button
                type="button"
                onClick={() => setEditorSurface('diff')}
                className={`px-2.5 py-1 text-[11px] rounded-sm transition-colors cursor-pointer ${editorSurface === 'diff' ? 'bg-accent-primary text-black' : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'}`}
              >
                Diff
              </button>
            </div>
          ) : null}
          {fileLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-primary" />}
        </div>
      </div>

      {!selectedPath ? (
        <div
          className="flex flex-1 min-h-0 items-center justify-center px-6 text-center"
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
          {canShowCodeDiff && editorSurface === 'diff' ? (
            <GitDiffView
              basePath={project?.local_path || null}
              path={selectedPath}
              staged={diffStaged}
            />
          ) : isPdf ? (
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
            <CodeFileView path={selectedPath} value={content} loading={fileLoading} />
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
      data-workspace-id={workspaceId || 'default'}
      className={`flex h-full w-full min-h-0 flex-col overflow-hidden ${embedded ? '' : 'flex-1'}`}
      style={{ background: embedded ? 'var(--chrome-panel-fill)' : undefined }}
    >
      {/* Non-embedded dock: refresh only. Embedded files use floating panel chrome. */}
      {!embedded ? (
        <div
          className="flex items-center justify-end gap-3 border-b border-borders-subtle px-3 py-1.5"
          style={{
            background: 'var(--chrome-panel-fill-emphasis)',
            borderBottomColor: 'var(--chrome-border-color)',
          }}
        >
          <button
            type="button"
            data-testid="editor-pane-refresh"
            onClick={() => fileExplorerRef.current?.refresh?.()}
            className="cursor-pointer rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text-primary"
            title="Recargar árbol de archivos"
            aria-label="Recargar árbol de archivos"
            style={btnSecondaryStyle({ size: 'xs' })}
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ) : null}

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
