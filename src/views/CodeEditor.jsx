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
    <div className="core-page-shell flex h-full min-h-0 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 core-sticky-header flex items-center justify-between border-b px-6 py-2" style={getWorkspacePageHeaderStyle()}>
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="min-w-0">
            <WorkspacePageTitle
              icon={FileCode2}
              title="Editor de Código"
              projectName={project?.name}
            />
            <div className="mt-0.5 flex min-w-0 flex-col text-xs text-text-muted">
              <span data-testid="code-editor-project-path" className="truncate" title={editorContext.projectPath || project?.local_path || ''}>
                {editorContext.projectPath || project?.local_path || 'Project path unavailable'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-full w-full flex-1 min-h-0 overflow-hidden">
        <FileExplorerEditorPane project={project} embedded={false} onContextChange={setEditorContext} />
      </div>
    </div>
  );
}
