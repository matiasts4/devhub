import { useState } from 'react';

export function CopilotAuthPanel({ isAuthenticated = false, onAuthChange }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await fetch('/api/settings/llm-providers/copilot/device-flow', { method: 'POST' });
      onAuthChange?.(true);
    } catch (err) {
      setError(err?.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return (
      <div>
        <p>Autenticado</p>
        <button type="button" data-testid="copilot-logout" onClick={() => onAuthChange?.(false)}>
          Cerrar sesion
        </button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" data-testid="copilot-login" onClick={handleLogin} disabled={loading}>
        {loading ? 'Conectando' : 'Login con GitHub Copilot'}
      </button>
      {error ? <p>{error}</p> : null}
    </div>
  );
}

export default CopilotAuthPanel;
