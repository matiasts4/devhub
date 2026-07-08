/**
 * PizarraContextMenu — Phase 3 presentational contracts.
 *
 * The Radix open/close + positioning is library behavior; here we mock
 * the UI primitives to assert the editing-UX contract: the right item
 * set renders per mode (element vs canvas), the lock label flips, the
 * "Pegar aquí" enable state tracks canPaste, and each item dispatches
 * the expected action. The trigger passes the canvas container through.
 *
 * Follows the repo's node-env + domHarness + createRoot test pattern.
 */

const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { installDom } = require('@/test-support/domHarness');

installDom();

jest.mock('@/components/ui/context-menu', () => {
  const R = require('react');
  const h = R.createElement.bind(R);
  return {
    ContextMenu: ({ children }) => h('div', { 'data-testid': 'cm-root' }, children),
    ContextMenuTrigger: ({ children }) => h('div', { 'data-testid': 'cm-trigger' }, children),
    ContextMenuContent: ({ children }) => h('div', { 'data-testid': 'cm-content' }, children),
    ContextMenuItem: ({ children, onSelect, disabled }) =>
      h(
        'button',
        { type: 'button', 'data-testid': 'cm-item', disabled: !!disabled, onClick: onSelect },
        children
      ),
    ContextMenuSeparator: () => h('hr', { 'data-testid': 'cm-sep' }),
  };
});

const PizarraContextMenu = require('@/components/pizarra/PizarraContextMenu').default;

function makeActions() {
  return {
    duplicate: jest.fn(),
    copy: jest.fn(),
    bringToFront: jest.fn(),
    forward: jest.fn(),
    backward: jest.fn(),
    sendToBack: jest.fn(),
    toggleLock: jest.fn(),
    delete: jest.fn(),
    pasteHere: jest.fn(),
    selectAll: jest.fn(),
    fitAll: jest.fn(),
    clear: jest.fn(),
  };
}

function renderSync(node) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(node));
  return { container, root };
}

function findButton(container, text) {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent.trim() === text
  );
}

function hasButton(container, text) {
  return Boolean(findButton(container, text));
}

describe('PizarraContextMenu — trigger passthrough', () => {
  test('renders the canvas container as the trigger child', () => {
    const { container } = renderSync(
      React.createElement(
        PizarraContextMenu,
        { mode: 'canvas', actions: makeActions() },
        React.createElement('div', { 'data-testid': 'canvas-host' }, 'canvas')
      )
    );
    expect(container.querySelector('[data-testid="canvas-host"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="cm-trigger"]').textContent).toContain('canvas');
  });
});

describe('PizarraContextMenu — element mode', () => {
  const elementLabels = [
    'Duplicar',
    'Copiar',
    'Traer al frente',
    'Adelante',
    'Atrás',
    'Enviar al fondo',
    'Eliminar',
  ];

  test('renders the element item set', () => {
    const { container } = renderSync(
      React.createElement(
        PizarraContextMenu,
        { mode: 'element', locked: false, actions: makeActions() },
        React.createElement('div', null, 'canvas')
      )
    );
    elementLabels.forEach((label) => expect(hasButton(container, label)).toBe(true));
    expect(hasButton(container, 'Bloquear')).toBe(true);
  });

  test('shows "Bloquear" when unlocked and "Desbloquear" when locked', () => {
    const { container, root } = renderSync(
      React.createElement(
        PizarraContextMenu,
        { mode: 'element', locked: false, actions: makeActions() },
        React.createElement('div', null, 'canvas')
      )
    );
    expect(hasButton(container, 'Bloquear')).toBe(true);
    expect(hasButton(container, 'Desbloquear')).toBe(false);

    flushSync(() =>
      root.render(
        React.createElement(
          PizarraContextMenu,
          { mode: 'element', locked: true, actions: makeActions() },
          React.createElement('div', null, 'canvas')
        )
      )
    );
    expect(hasButton(container, 'Desbloquear')).toBe(true);
    expect(hasButton(container, 'Bloquear')).toBe(false);
  });

  test('each element item dispatches its action', () => {
    const actions = makeActions();
    const { container } = renderSync(
      React.createElement(
        PizarraContextMenu,
        { mode: 'element', locked: false, actions },
        React.createElement('div', null, 'canvas')
      )
    );
    findButton(container, 'Duplicar').click();
    expect(actions.duplicate).toHaveBeenCalledTimes(1);
    findButton(container, 'Copiar').click();
    expect(actions.copy).toHaveBeenCalledTimes(1);
    findButton(container, 'Traer al frente').click();
    expect(actions.bringToFront).toHaveBeenCalledTimes(1);
    findButton(container, 'Adelante').click();
    expect(actions.forward).toHaveBeenCalledTimes(1);
    findButton(container, 'Atrás').click();
    expect(actions.backward).toHaveBeenCalledTimes(1);
    findButton(container, 'Enviar al fondo').click();
    expect(actions.sendToBack).toHaveBeenCalledTimes(1);
    findButton(container, 'Bloquear').click();
    expect(actions.toggleLock).toHaveBeenCalledTimes(1);
    findButton(container, 'Eliminar').click();
    expect(actions.delete).toHaveBeenCalledTimes(1);
  });
});

describe('PizarraContextMenu — canvas mode', () => {
  test('renders the canvas item set and no element-only items', () => {
    const { container } = renderSync(
      React.createElement(
        PizarraContextMenu,
        { mode: 'canvas', canPaste: true, actions: makeActions() },
        React.createElement('div', null, 'canvas')
      )
    );
    ['Pegar aquí', 'Seleccionar todo', 'Ajustar todo', 'Limpiar pizarra'].forEach((label) =>
      expect(hasButton(container, label)).toBe(true)
    );
    expect(hasButton(container, 'Duplicar')).toBe(false);
    expect(hasButton(container, 'Eliminar')).toBe(false);
  });

  test('"Pegar aquí" is disabled when canPaste is false, enabled when true', () => {
    const actions = makeActions();
    const { container, root } = renderSync(
      React.createElement(
        PizarraContextMenu,
        { mode: 'canvas', canPaste: false, actions },
        React.createElement('div', null, 'canvas')
      )
    );
    expect(findButton(container, 'Pegar aquí').disabled).toBe(true);

    flushSync(() =>
      root.render(
        React.createElement(
          PizarraContextMenu,
          { mode: 'canvas', canPaste: true, actions },
          React.createElement('div', null, 'canvas')
        )
      )
    );
    const pasteBtn = findButton(container, 'Pegar aquí');
    expect(pasteBtn.disabled).toBe(false);
    pasteBtn.click();
    expect(actions.pasteHere).toHaveBeenCalledTimes(1);
  });

  test('canvas items dispatch their actions', () => {
    const actions = makeActions();
    const { container } = renderSync(
      React.createElement(
        PizarraContextMenu,
        { mode: 'canvas', canPaste: true, actions },
        React.createElement('div', null, 'canvas')
      )
    );
    findButton(container, 'Seleccionar todo').click();
    expect(actions.selectAll).toHaveBeenCalledTimes(1);
    findButton(container, 'Ajustar todo').click();
    expect(actions.fitAll).toHaveBeenCalledTimes(1);
    findButton(container, 'Limpiar pizarra').click();
    expect(actions.clear).toHaveBeenCalledTimes(1);
  });
});
