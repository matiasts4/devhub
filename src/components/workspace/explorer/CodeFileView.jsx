'use client';

import Editor from '@monaco-editor/react';
import { Loader2 } from 'lucide-react';
import { detectCodeLanguage, MONACO_CODE_OPTIONS } from './codeLanguages';

function MonacoLoading() {
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: 'var(--chrome-panel-fill)' }}
    >
      <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
    </div>
  );
}

/** Read-only code surface — dense Monaco, not document preview. */
export function CodeFileView({ path, value, loading }) {
  if (loading) return <MonacoLoading />;

  return (
    <div className="h-full min-h-0 min-w-0 w-full overflow-hidden" data-testid="code-file-view">
      <Editor
        height="100%"
        language={detectCodeLanguage(path)}
        theme="vs-dark"
        value={value ?? ''}
        options={MONACO_CODE_OPTIONS}
        loading={<MonacoLoading />}
      />
    </div>
  );
}
