'use client';

import { TestTube2, Save, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export function ProviderActions({ onTest, onSave, isSaving, isTesting, testResult }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
      style={{ borderTop: '1px dashed var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2">
        <button
          data-testid="test-button"
          onClick={onTest}
          disabled={isTesting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors hover:opacity-80 disabled:opacity-50 cursor-pointer"
          style={{
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-secondary)',
          }}
        >
          {isTesting ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
          {isTesting ? 'Validando...' : 'Validar Credencial'}
        </button>

        <button
          data-testid="save-button"
          onClick={onSave}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 px-5 py-2 font-mono text-sm shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 rounded cursor-pointer"
          style={{
            background: 'var(--accent-primary)',
            color: 'white',
          }}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Guardar
            </>
          )}
        </button>
      </div>

      {/* Test result */}
      <div className="flex flex-col items-end gap-1">
        {testResult && (
          <div
            className="flex text-[11px] px-2 py-0.5 rounded font-mono border"
            style={{
              background: testResult.valid
                ? 'color-mix(in srgb, var(--success, #22c55e) 15%, transparent)'
                : 'color-mix(in srgb, var(--danger, #ef4444) 15%, transparent)',
              borderColor: testResult.valid
                ? 'color-mix(in srgb, var(--success, #22c55e) 30%, transparent)'
                : 'color-mix(in srgb, var(--danger, #ef4444) 30%, transparent)',
              color: testResult.valid ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)',
            }}
          >
            {testResult.valid ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 size={12} /> OK - Autenticado
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle size={12} /> ERR - {testResult.error}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
