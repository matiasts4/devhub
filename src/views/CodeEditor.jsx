'use client';

import { useState } from 'react';
import { FileCode2 } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import FileExplorerEditorPane from '@/components/workspace/FileExplorerEditorPane';
import WorkspacePageTitle from '@/components/workspace/WorkspacePageTitle';
import { getWorkspacePageHeaderStyle } from './workspacePageChrome';

export default function CodeEditor() {
  const { project } = useOutletContext() || {};
  const [editorContext, setEditorContext] = useState({
    projectPath: project?.local_path || '',
    currentFilePath: '',
    breadcrumb: [],
  });

  return (
    <div className="h-full min-h-screen core-page-shell flex flex-col">
      <div className="sticky top-0 z-10 core-sticky-header border-b px-6 py-3 flex items-center justify-between" style={getWorkspacePageHeaderStyle()}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <WorkspacePageTitle
              icon={FileCode2}
              title="Editor de Código"
              projectName={project?.name}
            />
            <div className="mt-1 flex min-w-0 flex-col gap-0.5 text-xs text-text-muted">
              <span data-testid="code-editor-project-path" className="truncate" title={editorContext.projectPath || project?.local_path || ''}>
                {editorContext.projectPath || project?.local_path || 'Project path unavailable'}
              </span>
              <span data-testid="code-editor-current-file" className="truncate text-text-secondary" title={editorContext.currentFilePath || 'No file selected'}>
                {editorContext.currentFilePath || 'No file selected'}
              </span>
              <span data-testid="code-editor-current-breadcrumb" className="truncate text-[11px] uppercase tracking-[0.14em] text-text-muted" title={(editorContext.breadcrumb || []).join(' / ')}>
                {(editorContext.breadcrumb || []).length > 0 ? editorContext.breadcrumb.join(' / ') : 'Workspace context'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <FileExplorerEditorPane project={project} embedded={false} onContextChange={setEditorContext} />
      </div>
    </div>
  );
}
