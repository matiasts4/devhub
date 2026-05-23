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

describe('ProviderCardShell', () => {
  let ProviderCardShell;

  beforeEach(() => {
    jest.resetModules();
    ({ ProviderCardShell } = require('@/components/settings/shared/ProviderCardShell'));
  });

  test('renders name as heading', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderCardShell, {
        name: 'Test Provider',
        description: 'A test provider',
        isEnabled: true,
        onToggle: jest.fn(),
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Test Provider');
  });

  test('renders description text', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderCardShell, {
        name: 'Test',
        description: 'Provider description here',
        isEnabled: true,
        onToggle: jest.fn(),
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Provider description here');
  });

  test('renders children inside the card', async () => {
    const { container } = await renderIntoDom(
      React.createElement(
        ProviderCardShell,
        {
          name: 'Test',
          description: 'desc',
          isEnabled: true,
          onToggle: jest.fn(),
        },
        React.createElement('div', { 'data-testid': 'child-content' }, 'Inner content')
      ),
      mountedRoots
    );

    const child = container.querySelector('[data-testid="child-content"]');
    expect(child).toBeTruthy();
    expect(child.textContent).toBe('Inner content');
  });

  test('calls onToggle when toggle button is clicked', async () => {
    const onToggle = jest.fn();
    const { container } = await renderIntoDom(
      React.createElement(ProviderCardShell, {
        name: 'Test',
        description: 'desc',
        isEnabled: true,
        onToggle,
      }),
      mountedRoots
    );

    const toggleBtn = container.querySelector('[data-testid="provider-toggle"]');
    expect(toggleBtn).toBeTruthy();
    toggleBtn.click();
    await flushEffects();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('renders priority badge when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderCardShell, {
        name: 'Test',
        description: 'desc',
        isEnabled: true,
        onToggle: jest.fn(),
        priority: 2,
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('PRIORIDAD: 2');
  });

  test('renders action buttons when provided', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderCardShell, {
        name: 'Test',
        description: 'desc',
        isEnabled: true,
        onToggle: jest.fn(),
        actions: React.createElement('button', { 'data-testid': 'custom-action' }, 'Action'),
      }),
      mountedRoots
    );

    const action = container.querySelector('[data-testid="custom-action"]');
    expect(action).toBeTruthy();
    expect(action.textContent).toBe('Action');
  });

  test('applies reduced opacity when disabled', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ProviderCardShell, {
        name: 'Test',
        description: 'desc',
        isEnabled: false,
        onToggle: jest.fn(),
      }),
      mountedRoots
    );

    const card = container.querySelector('[data-testid="provider-card"]');
    expect(card).toBeTruthy();
    expect(card.style.opacity).toBe('0.6');
  });
});
