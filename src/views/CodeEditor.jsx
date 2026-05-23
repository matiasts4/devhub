'use client';

import { useState } from 'react';
import { FileCode2 } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import FileExplorerEditorPane from '@/components/workspace/FileExplorerEditorPane';

export default function CodeEditor() {
  const { project } = useOutletContext() || {};
  const [editorContext, setEditorContext] = useState({
    projectPath: project?.local_path || '',
    currentFilePath: '',
    breadcrumb: [],
  });

  return (
    <div className="h-full min-h-0 overflow-hidden core-page-shell flex flex-col">
      <div className="sticky top-0 z-10 core-sticky-header border-b border-borders-subtle px-6 py-3 flex items-center justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FileCode2 className="mt-0.5 w-4 h-4 text-accent-primary" strokeWidth={1.5} />
          <div className="min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="font-mono text-base font-bold text-text-primary">Editor de Código</h1>
              {project?.name && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-elevated border border-borders-strong text-text-muted truncate max-w-[220px]">
                  {project.name}
                </span>
              )}
            </div>
            <div className="mt-1 flex min-w-0 flex-col gap-0.5 text-xs text-text-muted">
              <span
                data-testid="code-editor-project-path"
                className="truncate"
                title={editorContext.projectPath || project?.local_path || ''}
              >
                {editorContext.projectPath || project?.local_path || 'Project path unavailable'}
              </span>
              <span
                data-testid="code-editor-current-file"
                className="truncate text-text-secondary"
                title={editorContext.currentFilePath || 'No file selected'}
              >
                {editorContext.currentFilePath || 'No file selected'}
              </span>
              <span
                data-testid="code-editor-current-breadcrumb"
                className="truncate text-[11px] uppercase tracking-[0.14em] text-text-muted"
                title={(editorContext.breadcrumb || []).join(' / ')}
              >
                {(editorContext.breadcrumb || []).length > 0
                  ? editorContext.breadcrumb.join(' / ')
                  : 'Workspace context'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-full w-full flex-1 min-h-0 overflow-hidden">
        <FileExplorerEditorPane
          project={project}
          embedded={false}
          onContextChange={setEditorContext}
        />
      </div>
    </div>
  );
}
