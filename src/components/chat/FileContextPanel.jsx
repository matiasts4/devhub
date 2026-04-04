import { useState, useRef } from 'react';
import { FileText, Code, X, Paperclip } from 'lucide-react';

// Language extensions that count as "code"
const CODE_EXTENSIONS = new Set([
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'php',
  'vue',
  'svelte',
  'css',
  'scss',
  'sass',
  'less',
  'html',
  'xml',
  'json',
  'yaml',
  'yml',
  'toml',
  'md',
  'sh',
  'bash',
  'zsh',
  'sql',
  'graphql',
  'proto',
  'Dockerfile',
  'Makefile',
  'mod',
  'sum',
  'lock',
]);

function getFileIcon(name) {
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const basename = name.split('/').pop();
  if (CODE_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(basename)) return Code;
  return FileText;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * FileContextPanel — shows attached file chips above the chat input.
 * Files are stored in component state and sent with each message as context.
 *
 * Props:
 *   files:    Array of { id, name, path, content, size, type }
 *   onAdd:    (file) => void
 *   onRemove: (id) => void
 */
export default function FileContextPanel({ files = [], onAdd, onRemove }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Read file content when user picks files
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    selectedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        onAdd({
          id: crypto.randomUUID(),
          name: file.name,
          path: file.name,
          content: ev.target.result,
          size: file.size,
          type: file.type || 'text/plain',
        });
      };
      reader.readAsText(file);
    });
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  // Drag & drop support
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        onAdd({
          id: crypto.randomUUID(),
          name: file.name,
          path: file.name,
          content: ev.target.result,
          size: file.size,
          type: file.type || 'text/plain',
        });
      };
      reader.readAsText(file);
    });
  };

  if (files.length === 0 && !onAdd) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-4 pt-3 transition-all ${
        isDragOver ? 'animate-in fade-in' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {files.map((file) => {
        const Icon = getFileIcon(file.name);
        return (
          <div
            key={file.id}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all animate-in fade-in slide-in-from-bottom-1 duration-150"
            style={{
              background: 'var(--surface-card)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
              e.currentTarget.style.background = 'var(--surface-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-strong)';
              e.currentTarget.style.background = 'var(--surface-card)';
            }}
            title={`${file.path} (${formatSize(file.size)})`}
          >
            <Icon
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: 'var(--accent-primary)' }}
            />
            <span className="max-w-[140px] truncate">{file.name}</span>
            <span className="opacity-50">{formatSize(file.size)}</span>
            <button
              onClick={() => onRemove(file.id)}
              className="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  'color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)';
                e.currentTarget.style.color = 'var(--danger, #ef4444)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
              title="Remove file"
              aria-label={`Remove ${file.name}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}

      {onAdd && (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer"
          style={{
            background: isDragOver
              ? 'color-mix(in srgb, var(--accent-primary) 15%, transparent)'
              : 'var(--surface-card)',
            borderColor: isDragOver ? 'var(--accent-primary)' : 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
          onMouseEnter={(e) => {
            if (!isDragOver) {
              e.currentTarget.style.color = 'var(--accent-primary)';
              e.currentTarget.style.borderColor = 'var(--accent-primary)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDragOver) {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
            }
          }}
          title="Attach file"
        >
          <Paperclip className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Attach</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        aria-label="Attach files"
      />
    </div>
  );
}
