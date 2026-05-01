'use client';

import { FileCode2 } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import FileExplorerEditorPane from '@/components/workspace/FileExplorerEditorPane';

export default function CodeEditor() {
  const { project } = useOutletContext() || {};

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
      </div>

      <div className="flex-1 min-h-0">
        <FileExplorerEditorPane project={project} embedded={false} />
      </div>
    </div>
  );
}
