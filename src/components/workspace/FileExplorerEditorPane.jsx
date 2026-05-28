'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  readEditorPaneState,
  writeEditorPaneState,
} from './editorPaneState';
import {
  panelStyle,
  pillStyle,
  btnSecondaryStyle,
  inputStyle,
} from '@/chrome/morphology';
import 'highlight.js/styles/github-dark.css';

const DOCUMENT_VIEW_MODES = {
  PREVIEW: 'preview',
  RAW: 'raw',
};

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
  const normalizedQuery = String(query || '').trim().toLowerCase();
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

function TreeNode({ node, level, expanded, onToggle, onSelect, selectedPath }) {
  const isDir = node.type === 'directory';
  const isExpanded = isDir && expanded.has(node.path);
  const isSelected = selectedPath === node.path;
  const indent = level * 12;
  const { Icon: FileIcon, color } = getFileIconMeta(node);

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

      {isDir && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileExplorerEditorPane({ project, workspaceId = 'default', embedded = false, onContextChange }) {
  const explorerPanelRef = useRef(null);
  const workspaceSnapshotsRef = useRef(new Map());
  const [tree, setTree] = useState([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState('');
  const [expanded, setExpanded] = useState(new Set(DEFAULT_EDITOR_PANE_STATE.expandedPaths));
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(DEFAULT_EDITOR_PANE_STATE.isTreeCollapsed);
  const [selectedPath, setSelectedPath] = useState(DEFAULT_EDITOR_PANE_STATE.selectedPath);
  const [content, setContent] = useState(DEFAULT_EDITOR_PANE_CONTENT);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [markdownViewMode, setMarkdownViewMode] = useState(DOCUMENT_VIEW_MODES.PREVIEW);
  const [latexViewMode, setLatexViewMode] = useState(DOCUMENT_VIEW_MODES.PREVIEW);
  const [searchQuery, setSearchQuery] = useState(DEFAULT_EDITOR_PANE_STATE.searchQuery);

  const language = useMemo(() => detectLanguage(selectedPath || ''), [selectedPath]);
  const isMarkdown = useMemo(
    () => (selectedPath || '').toLowerCase().endsWith('.md'),
    [selectedPath]
  );
  const isLatex = useMemo(
    () => Boolean((selectedPath || '').toLowerCase().match(/\.(tex|latex|ltx)$/)),
    [selectedPath]
  );
  const activeDocumentViewMode = isMarkdown ? markdownViewMode : latexViewMode;
  const showPreviewToggle = (isMarkdown || isLatex) && !fileLoading && !fileError;
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const workspaceStateKey = `${project?.id || 'global'}:${workspaceId || 'default'}`;
  const filteredTree = useMemo(() => filterTreeNodes(tree, searchQuery), [tree, searchQuery]);
  const forcedExpandedPaths = useMemo(
    () => (searchQuery.trim() ? buildForcedExpandedPaths(filteredTree) : new Set()),
    [filteredTree, searchQuery]
  );
  const visibleExpandedPaths = useMemo(() => {
    if (!searchQuery.trim()) return expanded;
    return new Set([...expanded, ...forcedExpandedPaths]);
  }, [expanded, forcedExpandedPaths, searchQuery]);
  const currentFileBreadcrumb = useMemo(() => normalizePathSegments(selectedPath), [selectedPath]);

  const persistLegacyTreeCollapsedPref = useCallback(
    (nextValue) => {
      if (project?.id) {
        saveUIPref(project.id, 'editorFileTreeCollapsed', nextValue);
      }
    },
    [project?.id]
  );

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError('');
    try {
      const baseParam = project?.local_path ? `?base=${encodeURIComponent(project.local_path)}` : '';
      const response = await fetch(`/api/fs/tree${baseParam}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'No se pudo cargar el árbol de archivos.');
      }
      setTree(Array.isArray(data.tree) ? data.tree : []);
    } catch (error) {
      setTreeError(error.message || 'No se pudo cargar el árbol de archivos.');
    } finally {
      setTreeLoading(false);
    }
  }, [project?.local_path]);

  const loadFile = useCallback(
    async (path) => {
      if (!path) return;

      setSelectedPath(path);
      setFileLoading(true);
      setFileError('');

      try {
        const baseParam = project?.local_path ? `&base=${encodeURIComponent(project.local_path)}` : '';
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
        (inMemorySnapshot?.expandedPaths && inMemorySnapshot.expandedPaths.length > 0)
          ? inMemorySnapshot.expandedPaths
          : (hasUIPref(project?.id, 'editorExpandedPaths') ? legacyPrefs.editorExpandedPaths : persistedSnapshot.expandedPaths),
      isTreeCollapsed:
        typeof inMemorySnapshot?.isTreeCollapsed === 'boolean'
          ? inMemorySnapshot.isTreeCollapsed
          : Boolean(legacyPrefs.editorFileTreeCollapsed ?? persistedSnapshot.isTreeCollapsed),
      markdownViewMode:
        inMemorySnapshot?.markdownViewMode ||
        (legacyPrefs.editorMarkdownViewMode === DOCUMENT_VIEW_MODES.RAW ? DOCUMENT_VIEW_MODES.RAW : persistedSnapshot.markdownViewMode),
      latexViewMode:
        inMemorySnapshot?.latexViewMode ||
        (legacyPrefs.editorLatexViewMode === DOCUMENT_VIEW_MODES.RAW ? DOCUMENT_VIEW_MODES.RAW : persistedSnapshot.latexViewMode),
    };

    setExpanded(new Set(nextState.expandedPaths || DEFAULT_EDITOR_PANE_STATE.expandedPaths));
    setIsTreeCollapsed(Boolean(nextState.isTreeCollapsed));
    setSelectedPath(nextState.selectedPath || '');
    setContent(inMemorySnapshot?.content || DEFAULT_EDITOR_PANE_CONTENT);
    setFileError(inMemorySnapshot?.fileError || '');
    setFileLoading(false);
    setSearchQuery(nextState.searchQuery || '');
    setMarkdownViewMode(nextState.markdownViewMode || DOCUMENT_VIEW_MODES.PREVIEW);
    setLatexViewMode(nextState.latexViewMode || DOCUMENT_VIEW_MODES.PREVIEW);
  }, [project?.id, storage, workspaceId, workspaceStateKey]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  useEffect(() => {
    const snapshot = {
      expandedPaths: Array.from(expanded),
      isTreeCollapsed,
      selectedPath,
      searchQuery,
      markdownViewMode,
      latexViewMode,
      content,
      fileError,
    };

    workspaceSnapshotsRef.current.set(workspaceStateKey, snapshot);
    writeEditorPaneState(storage, project?.id, workspaceId, snapshot);
  }, [content, expanded, fileError, isTreeCollapsed, markdownViewMode, latexViewMode, project?.id, searchQuery, selectedPath, storage, workspaceId, workspaceStateKey]);

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
        if (next.has(path)) next.delete(path);
        else next.add(path);

        if (project?.id) {
          saveUIPref(project.id, 'editorExpandedPaths', Array.from(next));
        }

        return next;
      });
    },
    [project?.id]
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
    setSearchQuery('');
  }, []);

  return (
    <div
      data-testid="shared-editor-pane"
      className={`flex flex-col min-h-0 ${embedded ? 'h-full' : 'flex-1'}`}
      style={{ background: embedded ? 'var(--chrome-panel-fill)' : undefined }}
    >
      <div className="px-4 py-2 border-b border-borders-subtle flex items-center justify-between gap-3" style={{ background: 'var(--chrome-panel-fill-emphasis)', borderBottomColor: 'var(--chrome-border-color)' }}>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted font-semibold">
            Workspace files
          </p>
        </div>
        <button
          type="button"
          onClick={loadTree}
          className="text-text-muted hover:text-text-primary transition-colors p-1.5 rounded-md hover:bg-surface-elevated cursor-pointer"
          title="Recargar árbol de archivos"
          aria-label="Recargar árbol de archivos"
          style={btnSecondaryStyle({ size: 'xs' })}
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel
            ref={explorerPanelRef}
            defaultSize={embedded ? 34 : 26}
            minSize={18}
            maxSize={45}
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
            className="flex flex-col h-full"
            style={{ overflow: 'clip' }}
          >
            {!isTreeCollapsed ? (
              <aside
                className="h-full flex flex-col border-r border-borders-subtle bg-surface-app"
                data-testid="editor-tree-panel"
              >
                <div className="flex-shrink-0 border-b border-borders-subtle px-2 py-2">
                  <div className="flex items-center gap-2 border border-borders-subtle px-2.5 py-2" style={inputStyle()}>
                    <input
                      type="search"
                      value={searchQuery}
                      onInput={(event) => setSearchQuery(event.currentTarget.value)}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search files or paths"
                      className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
                      data-testid="editor-tree-search-input"
                      aria-label="Search files"
                    />
                    {searchQuery ? (
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
                <div className="flex-1 min-h-0 overflow-y-auto p-2" style={{ overscrollBehavior: 'contain' }}>
                  {treeLoading ? (
                    <div className="p-2 space-y-3">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex items-center gap-2" style={{ animationDelay: `${i * 80}ms` }}>
                          <div className="w-3.5 h-3.5 rounded-sm animate-pulse" style={{ background: 'var(--chrome-control-fill)' }} />
                          <div
                            className={`h-3 rounded animate-pulse ${i % 2 === 0 ? 'w-28' : 'w-20'}`}
                            style={{ background: 'var(--chrome-control-fill)' }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : treeError ? (
                    <div className="text-xs text-danger p-2 rounded-md border border-[#F778BA33] bg-[#F778BA11]">
                      {treeError}
                    </div>
                  ) : filteredTree.length === 0 ? (
                    searchQuery.trim() ? (
                      <div
                        className="rounded-md border border-borders-subtle bg-surface-elevated px-3 py-2 text-xs text-text-muted"
                        data-testid="editor-tree-empty-search"
                      >
                        No files match “{searchQuery.trim()}”.
                      </div>
                    ) : (
                      <div className="text-xs text-text-muted p-2">No se encontraron archivos.</div>
                    )
                  ) : tree.length === 0 ? (
                    <div className="text-xs text-text-muted p-2">No se encontraron archivos.</div>
                  ) : (
                    filteredTree.map((node) => (
                      <TreeNode
                        key={node.path}
                        node={node}
                        level={0}
                        expanded={visibleExpandedPaths}
                        onToggle={toggleNode}
                        onSelect={loadFile}
                        selectedPath={selectedPath}
                      />
                    ))
                  )}
                </div>
              </aside>
            ) : (
              <div className="h-full w-0 overflow-hidden" aria-hidden="true" />
            )}
          </ResizablePanel>

          {!isTreeCollapsed && <ResizableHandle className="bg-surface-elevated" />}

          <ResizablePanel defaultSize={embedded ? 66 : 74} minSize={45} className="flex flex-col h-full" style={{ overflow: 'clip' }}>
            <section className="h-full flex flex-col overflow-hidden">
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
                    <p className="truncate text-[11px] font-medium text-text-primary" title={selectedPath || 'Ningún archivo seleccionado'}>
                      {selectedPath || 'Ningún archivo seleccionado'}
                    </p>
                    <p
                      className="truncate text-[10px] uppercase tracking-[0.14em] text-text-muted"
                      title={currentFileBreadcrumb.join(' / ') || project?.local_path || ''}
                      data-testid="editor-current-breadcrumb"
                    >
                      {currentFileBreadcrumb.length > 0 ? currentFileBreadcrumb.join(' / ') : (project?.local_path || 'Workspace context')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {showPreviewToggle && (
                    <div className="inline-flex rounded-md border border-borders-subtle p-0.5" style={{ background: 'var(--chrome-control-fill)' }}>
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

              {fileError ? (
                <div className="m-4 p-4 border border-[#F778BA33] bg-[#F778BA11] text-danger text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{fileError}</span>
                </div>
              ) : (
                <div className="flex-1 min-h-0 relative overflow-y-auto" style={{ background: 'var(--chrome-panel-fill)', overscrollBehavior: 'contain' }}>
                  {(selectedPath || '').toLowerCase().match(/\.pdf$/) ? (
                    <iframe src={content} className="w-full h-full border-none relative z-10" style={{ background: 'var(--chrome-panel-fill)' }} title="PDF Viewer" />
                  ) : (selectedPath || '').toLowerCase().match(/\.(png|jpe?g|gif|webp|svg)$/) ? (
                    <div className="flex items-center justify-center h-full bg-surface-base/50 p-8 overflow-auto">
                      <img src={content} className="max-w-full max-h-full object-contain shadow-xl rounded pointer-events-none" alt={selectedPath} />
                    </div>
                  ) : (selectedPath || '').toLowerCase().match(/\.(docx?|xlsx?)$/) ? (
                    <div className="flex flex-col items-center justify-center h-full bg-surface-base text-text-secondary gap-4 p-8 text-center">
                      <FileText className="w-16 h-16 opacity-30" />
                      <h3 className="text-text-primary text-lg font-medium">Archivo Office Detectado</h3>
                      <p className="text-sm">
                        Para ver documentos Word o Excel fluidamente, descárgalo o ábrelo en sus editores nativos.
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
                      <div className="filesystem-markdown-shell">
                        <div className="filesystem-markdown-preview">
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
                    )
                  ) : isLatex && latexViewMode === DOCUMENT_VIEW_MODES.PREVIEW ? (
                    fileLoading ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="w-8 h-8 border-2 border-t-[var(--accent-primary)] rounded-full animate-spin" />
                      </div>
                    ) : (
                      <LatexDocumentPreview content={content} filePath={selectedPath} />
                    )
                  ) : (
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
                  )}
                </div>
              )}
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
