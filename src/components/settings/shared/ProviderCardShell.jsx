import React from 'react';

export function ProviderCardShell({
  name,
  description,
  isEnabled = true,
  onToggle,
  priority = null,
  actions = null,
  children = null,
}) {
  return (
    <section
      data-testid="provider-card"
      style={{ opacity: isEnabled ? '1' : '0.6' }}
    >
      <div>
        <h3>{name}</h3>
        <p>{description}</p>
      </div>
      <button type="button" data-testid="provider-toggle" onClick={() => onToggle?.()}>
        {isEnabled ? 'Activo' : 'Inactivo'}
      </button>
      {priority != null ? <div>{`PRIORIDAD: ${priority}`}</div> : null}
      {actions}
      {children}
    </section>
  );
}

export default ProviderCardShell;
