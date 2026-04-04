'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  AlertTriangle,
  Braces,
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
import { useOutletContext } from 'react-router-dom';
import { getUIPrefs, hasUIPref, saveUIPref } from '@/lib/uiState';

function detectLanguage(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js')) return 'javascript';
  if (lower.endsWith('.jsx')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
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

  if (lower === '.gitignore' || lower.endsWith('.gitignore'))
    return { Icon: GitBranch, color: '#A371F7' };
  if (lower === '.env' || lower.startsWith('.env.')) return { Icon: Shield, color: '#3FB950' };
  if (path.endsWith('.js') || path.endsWith('.jsx')) return { Icon: FileCode2, color: '#F1E05A' };
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return { Icon: FileType, color: '#3178C6' };
  if (path.endsWith('.css')) return { Icon: Palette, color: '#264DE4' };
  if (path.endsWith('.json')) return { Icon: Braces, color: '#8B949E' };
  if (path.endsWith('.md')) return { Icon: FileText, color: '#8B949E' };

  return { Icon: File, color: '#8B949E' };
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
        className={`group flex items-center py-1 px-2 cursor-pointer text-sm select-none transition-colors ${isSelected ? 'bg-surface-elevated text-text-primary' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => {
          if (isDir) onToggle(node.path);
          else onSelect(node.path);
        }}
      >
        <div className="w-4 h-4 mr-1.5 flex items-center justify-center text-text-muted group-hover:text-text-secondary">
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
        <span className="truncate">{node.name}</span>
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

export default function CodeEditor() {
  const { project } = useOutletContext() || {};
  const [tree, setTree] = useState([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState('');
  const [expanded, setExpanded] = useState(new Set(['src']));
  const [uiPrefsReady, setUiPrefsReady] = useState(false);

  const [selectedPath, setSelectedPath] = useState('');
  const [content, setContent] = useState('// Selecciona un archivo del árbol para verlo aquí.');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');

  const language = useMemo(() => detectLanguage(selectedPath || ''), [selectedPath]);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError('');
    try {
      const baseParam = project?.local_path
        ? `?base=${encodeURIComponent(project.local_path)}`
        : '';
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
        const baseParam = project?.local_path
          ? `&base=${encodeURIComponent(project.local_path)}`
          : '';

        // Determine if media or text
        const lower = path.toLowerCase();
        const isMedia = lower.match(/\.(png|jpe?g|gif|webp|svg|pdf|mp3|mp4|docx?|xlsx?)$/i);

        if (isMedia) {
          // Just set the URL so the UI can render an iframe or img
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
    if (!project?.id) return;

    const prefs = getUIPrefs(project.id);
    setUiPrefsReady(false);
    setExpanded(
      hasUIPref(project.id, 'editorExpandedPaths')
        ? new Set(prefs.editorExpandedPaths || [])
        : new Set(['src'])
    );
    setUiPrefsReady(true);
  }, [project?.id]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const toggleNode = useCallback(
    (path) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }

        if (project?.id && uiPrefsReady) {
          saveUIPref(project.id, 'editorExpandedPaths', Array.from(next));
        }

        return next;
      });
    },
    [project?.id, uiPrefsReady]
  );

  return (
    <div className="h-full min-h-screen core-page-shell flex flex-col">
      <div className="sticky top-0 z-10 core-sticky-header border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <FileCode2 className="w-4 h-4 text-accent-primary" strokeWidth={1.5} />
          <h1 className="font-mono text-base font-bold text-text-primary">Editor de Código</h1>
          {project?.name && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted truncate max-w-[220px]">
              {project.name}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={loadTree}
          className="text-text-muted hover:text-text-primary transition-colors p-1.5 rounded-md hover:bg-surface-elevated cursor-pointer"
          title="Recargar árbol de archivos"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={26} minSize={18} maxSize={40}>
            <aside className="h-full border-r border-borders-subtle bg-surface-app flex flex-col">
              <div className="px-4 py-2.5 border-b border-borders-subtle">
                <p className="text-xs uppercase tracking-[0.13em] text-text-muted font-semibold">
                  Workspace
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {treeLoading ? (
                  <div className="p-2 space-y-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 bg-surface-elevated rounded-sm animate-pulse" />
                        <div
                          className={`h-3 bg-surface-elevated rounded animate-pulse ${i % 2 === 0 ? 'w-24' : 'w-16'}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : treeError ? (
                  <div className="text-xs text-danger p-2 rounded-md border border-[#F778BA33] bg-[#F778BA11]">
                    {treeError}
                  </div>
                ) : tree.length === 0 ? (
                  <div className="text-xs text-text-muted p-2">No se encontraron archivos.</div>
                ) : (
                  tree.map((node) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      level={0}
                      expanded={expanded}
                      onToggle={toggleNode}
                      onSelect={loadFile}
                      selectedPath={selectedPath}
                    />
                  ))
                )}
              </div>
            </aside>
          </ResizablePanel>

          <ResizableHandle className="bg-surface-elevated" />

          <ResizablePanel defaultSize={74} minSize={45}>
            <section className="h-full flex flex-col">
              <div className="px-4 py-2.5 border-b border-borders-subtle bg-surface-app flex items-center justify-between">
                <p className="text-xs text-text-muted truncate">
                  {selectedPath || 'Ningún archivo seleccionado'}
                </p>
                {fileLoading && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-primary" />
                )}
              </div>

              {fileError ? (
                <div className="m-4 p-4 rounded-lg border border-[#F778BA33] bg-[#F778BA11] text-danger text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{fileError}</span>
                </div>
              ) : (
                <div className="flex-1 min-h-0 relative bg-[#0b1220]">
                  {/* Media Viewers */}
                  {(selectedPath || '').toLowerCase().match(/\.pdf$/) ? (
                    <iframe
                      src={content}
                      className="w-full h-full border-none bg-[#0b1220] relative z-10"
                      title="PDF Viewer"
                    />
                  ) : (selectedPath || '').toLowerCase().match(/\.(png|jpe?g|gif|webp|svg)$/) ? (
                    <div className="flex items-center justify-center h-full bg-surface-base/50 p-8 overflow-auto">
                      <img
                        src={content}
                        className="max-w-full max-h-full object-contain shadow-xl rounded pointer-events-none"
                        alt={selectedPath}
                      />
                    </div>
                  ) : (selectedPath || '').toLowerCase().match(/\.(docx?|xlsx?)$/) ? (
                    <div className="flex flex-col items-center justify-center h-full bg-surface-base text-text-secondary gap-4 p-8 text-center">
                      <FileText className="w-16 h-16 opacity-30" />
                      <h3 className="text-text-primary text-lg font-medium">
                        Archivo Office Detectado
                      </h3>
                      <p className="text-sm">
                        Para ver documentos Word o Excel fluidamente, descárgalo o ábrelo en sus
                        editores nativos.
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
                        scrollBeyondLastLine: false,
                        padding: { top: 16 },
                      }}
                      loading={
                        <div className="flex h-full w-full items-center justify-center bg-[#0b1220]">
                          <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
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
