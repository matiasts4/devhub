export function ModelPicker({ value = '', options = [], loading = false, onRefresh, onChange }) {
  const safeOptions = Array.isArray(options) ? options : [];

  return (
    <div>
      <button type="button" data-testid="model-refresh" onClick={() => onRefresh?.()}>
        {loading ? 'Actualizando' : 'Actualizar Lista'}
      </button>

      {safeOptions.length === 0 ? (
        <p>Sin modelos disponibles</p>
      ) : (
        <div>
          {safeOptions.map((option) => (
            <button
              key={option}
              type="button"
              data-testid="model-option"
              data-active={option === value ? 'true' : 'false'}
              onClick={() => onChange?.(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ModelPicker;
