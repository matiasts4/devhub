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
  // Mock fetch for CopilotAuthPanel tests
  global.fetch = jest.fn();
});

afterEach(() => {
  cleanupMountedRoots(mountedRoots);
  global.fetch.mockRestore();
});

// Require once - no resetModules to avoid breaking React hooks
const { CopilotAuthPanel } = require('@/components/settings/providers/CopilotAuthPanel');

describe('CopilotAuthPanel', () => {
  test('renders login button when idle', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CopilotAuthPanel, {
        isAuthenticated: false,
        onAuthChange: jest.fn(),
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Login con GitHub Copilot');
  });

  test('renders authenticated state when isAuthenticated is true', async () => {
    const { container } = await renderIntoDom(
      React.createElement(CopilotAuthPanel, {
        isAuthenticated: true,
        onAuthChange: jest.fn(),
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Autenticado');
    expect(container.textContent).toContain('Cerrar sesion');
  });

  test('calls onAuthChange when logout is clicked', async () => {
    const onAuthChange = jest.fn();
    const { container } = await renderIntoDom(
      React.createElement(CopilotAuthPanel, {
        isAuthenticated: true,
        onAuthChange,
      }),
      mountedRoots
    );

    const logoutBtn = container.querySelector('[data-testid="copilot-logout"]');
    expect(logoutBtn).toBeTruthy();
    logoutBtn.click();
    await flushEffects();
    expect(onAuthChange).toHaveBeenCalledWith(false);
  });

  test('transitions to error state when login fetch fails', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const onAuthChange = jest.fn();
    const { container } = await renderIntoDom(
      React.createElement(CopilotAuthPanel, {
        isAuthenticated: false,
        onAuthChange,
      }),
      mountedRoots
    );

    const loginBtn = container.querySelector('[data-testid="copilot-login"]');
    expect(loginBtn).toBeTruthy();
    loginBtn.click();
    await flushEffects();
    // Wait for async fetch to reject
    await new Promise((r) => setTimeout(r, 50));
    await flushEffects();

    // Component should show error message
    expect(container.textContent).toContain('Network error');
  });

  test('shows error message when login fails', async () => {
    global.fetch.mockRejectedValue(new Error('Network error'));
    const { container } = await renderIntoDom(
      React.createElement(CopilotAuthPanel, {
        isAuthenticated: false,
        onAuthChange: jest.fn(),
      }),
      mountedRoots
    );

    const loginBtn = container.querySelector('[data-testid="copilot-login"]');
    loginBtn.click();
    await flushEffects();
    // Wait for async fetch to reject
    await new Promise((r) => setTimeout(r, 50));
    await flushEffects();

    // Should show error state after fetch fails
    expect(container.textContent).toContain('Network error');
  });
});
