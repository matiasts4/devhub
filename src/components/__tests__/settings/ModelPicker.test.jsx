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

// Require once - no resetModules to avoid breaking React hooks
const { ModelPicker } = require('@/components/settings/shared/ModelPicker');

describe('ModelPicker', () => {
  test('renders with options', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ModelPicker, {
        value: 'gpt-4',
        options: ['gpt-4', 'gpt-3.5'],
        loading: false,
        onRefresh: jest.fn(),
        onChange: jest.fn(),
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('gpt-4');
    expect(container.textContent).toContain('gpt-3.5');
  });

  test('calls onChange when a model option is clicked', async () => {
    const onChange = jest.fn();
    const { container } = await renderIntoDom(
      React.createElement(ModelPicker, {
        value: 'gpt-3.5',
        options: ['gpt-4', 'gpt-3.5'],
        loading: false,
        onRefresh: jest.fn(),
        onChange,
      }),
      mountedRoots
    );

    const options = container.querySelectorAll('[data-testid="model-option"]');
    expect(options).toHaveLength(2);
    options[0].click();
    await flushEffects();
    expect(onChange).toHaveBeenCalledWith('gpt-4');
  });

  test('highlights the active model', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ModelPicker, {
        value: 'gpt-4',
        options: ['gpt-4', 'gpt-3.5'],
        loading: false,
        onRefresh: jest.fn(),
        onChange: jest.fn(),
      }),
      mountedRoots
    );

    const activeOption = container.querySelector('[data-active="true"]');
    expect(activeOption).toBeTruthy();
    expect(activeOption.textContent).toContain('gpt-4');
  });

  test('shows loading state when loading is true', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ModelPicker, {
        value: 'gpt-4',
        options: ['gpt-4'],
        loading: true,
        onRefresh: jest.fn(),
        onChange: jest.fn(),
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Actualizando');
  });

  test('calls onRefresh when refresh button is clicked', async () => {
    const onRefresh = jest.fn();
    const { container } = await renderIntoDom(
      React.createElement(ModelPicker, {
        value: 'gpt-4',
        options: ['gpt-4'],
        loading: false,
        onRefresh,
        onChange: jest.fn(),
      }),
      mountedRoots
    );

    const refreshBtn = container.querySelector('[data-testid="model-refresh"]');
    expect(refreshBtn).toBeTruthy();
    refreshBtn.click();
    await flushEffects();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  test('renders empty message when no options', async () => {
    const { container } = await renderIntoDom(
      React.createElement(ModelPicker, {
        value: '',
        options: [],
        loading: false,
        onRefresh: jest.fn(),
        onChange: jest.fn(),
      }),
      mountedRoots
    );

    expect(container.textContent).toContain('Sin modelos disponibles');
  });
});
