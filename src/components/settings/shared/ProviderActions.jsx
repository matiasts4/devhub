import React from 'react';

export function ProviderActions({
  onTest,
  onSave,
  isSaving = false,
  isTesting = false,
  testResult = null,
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="test-button"
          onClick={() => onTest?.()}
          disabled={isTesting}
        >
          {isTesting ? 'Validando' : 'Validar Credencial'}
        </button>
        <button
          type="button"
          data-testid="save-button"
          onClick={() => onSave?.()}
          disabled={isSaving}
        >
          {isSaving ? 'Guardando' : 'Guardar'}
        </button>
      </div>

      {testResult ? (
        <div>
          {testResult.valid ? `OK - Autenticado` : `ERR - ${testResult.error || 'Error'}`}
        </div>
      ) : null}
    </div>
  );
}

export default ProviderActions;
