const React = require('react');
const {
  installDom,
  renderIntoDom,
  cleanupMountedRoots,
  flushEffects,
} = require('@/test-support/domHarness');

const mountedRoots = [];

beforeEach(() => {
  installDom();
});

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
});

describe('ProviderActions', () => {
  let ProviderActions;

  beforeEach(() => {
    jest.resetModules();
    ({ ProviderActions } = require('@/components/settings/shared/ProviderActions'));
  });

  test('renders test button', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave: jest.fn(),
        isSaving: false,
        isTesting: false,
        testResult: null,
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Validar Credencial');
  });

  test('renders save button', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave: jest.fn(),
        isSaving: false,
        isTesting: false,
        testResult: null,
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Guardar');
  });

  test('calls onTest when test button is clicked', async () => {
    const onTest = jest.fn();
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest,
        onSave: jest.fn(),
        isSaving: false,
        isTesting: false,
        testResult: null,
      }),
      mountedRoots
    );

    const testBtn = container.querySelector('[data-testid="test-button"]');
    expect(testBtn).toBeTruthy();
    testBtn.click();
    await flushEffects();
    expect(onTest).toHaveBeenCalledTimes(1);
  });

  test('calls onSave when save button is clicked', async () => {
    const onSave = jest.fn();
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave,
        isSaving: false,
        isTesting: false,
        testResult: null,
      }),
      mountedRoots
    );

    const saveBtn = container.querySelector('[data-testid="save-button"]');
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    await flushEffects();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  test('shows loading state when isTesting is true', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave: jest.fn(),
        isSaving: false,
        isTesting: true,
        testResult: null,
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Validando');
  });

  test('shows loading state when isSaving is true', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave: jest.fn(),
        isSaving: true,
        isTesting: false,
        testResult: null,
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Guardando');
  });

  test('shows success test result', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave: jest.fn(),
        isSaving: false,
        isTesting: false,
        testResult: { valid: true },
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('OK');
    expect(container.textContent).toContain('Autenticado');
  });

  test('shows error test result', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave: jest.fn(),
        isSaving: false,
        isTesting: false,
        testResult: { valid: false, error: 'Invalid key' },
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('ERR');
    expect(container.textContent).toContain('Invalid key');
  });

  test('disables test button when isTesting', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave: jest.fn(),
        isSaving: false,
        isTesting: true,
        testResult: null,
      }),
      mountedRoots
    );

    const testBtn = container.querySelector('[data-testid="test-button"]');
    expect(testBtn.disabled).toBe(true);
  });

  test('disables save button when isSaving', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderActions, {
        onTest: jest.fn(),
        onSave: jest.fn(),
        isSaving: true,
        isTesting: false,
        testResult: null,
      }),
      mountedRoots
    );

    const saveBtn = container.querySelector('[data-testid="save-button"]');
    expect(saveBtn.disabled).toBe(true);
  });
});
