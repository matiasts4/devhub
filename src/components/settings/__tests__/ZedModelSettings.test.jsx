/**
 * @jest-environment jsdom
 */

import ZedModelSettings from '../ZedModelSettings';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('lucide-react', () => {
  const ReactLocal = require('react');
  const icon = (name) => (props) =>
    ReactLocal.createElement('svg', { ...props, 'data-icon': name });
  return new Proxy({}, { get: (_, key) => icon(String(key)) });
});

function mockFetchSequence(handlers) {
  global.fetch = jest.fn((url, opts) => {
    const handler = handlers.find(([match]) => url.includes(match));
    if (!handler) throw new Error(`Unexpected fetch: ${url}`);
    return Promise.resolve({
      ok: true,
      json: async () => handler[1](opts),
    });
  });
}

describe('ZedModelSettings', () => {
  afterEach(() => {
    delete global.fetch;
    jest.clearAllMocks();
  });

  test('loads provider selection and xai config', async () => {
    mockFetchSequence([
      [
        '/api/settings/llm-providers',
        () => ({
          settings: { zed: { provider: 'xai' } },
          providers: {
            xai: {
              XAI_API_KEY: 'xai-existing-key',
              XAI_MODEL: 'grok-4.3',
              XAI_AUTH_MODE: 'api_key',
              enabled: true,
            },
          },
          modelOptions: { xai: ['grok-4.3', 'grok-4.20-0309-non-reasoning'] },
        }),
      ],
      [
        '/api/assistant/zed-provider-status',
        () => ({
          provider: 'xai',
          source: 'llm-providers-config',
          model: 'grok-4.3',
          hasKey: true,
        }),
      ],
    ]);

    render(<ZedModelSettings />);

    await waitFor(() => expect(screen.getByTestId('zed-provider-select').value).toBe('xai'));
    expect(screen.getByTestId('zed-xai-api-key-input').value).toBe('xai-existing-key');
    await waitFor(() =>
      expect(screen.getByTestId('zed-model-status').textContent).toMatch(/Grok \(xAI\)/)
    );
  });

  test('shows SuperGrok OAuth login when subscription mode is selected', async () => {
    mockFetchSequence([
      [
        '/api/settings/llm-providers',
        () => ({
          settings: { zed: { provider: 'xai' } },
          providers: {
            xai: { XAI_AUTH_MODE: 'api_key', XAI_MODEL: 'grok-4.3', enabled: true },
          },
          modelOptions: { xai: ['grok-4.3'] },
        }),
      ],
      [
        '/api/assistant/zed-provider-status',
        () => ({ provider: 'xai', model: 'grok-4.3', hasKey: false }),
      ],
    ]);

    render(<ZedModelSettings />);
    await waitFor(() => expect(screen.getByTestId('zed-provider-select')).toBeTruthy());

    fireEvent.click(screen.getByTestId('zed-xai-auth-mode-oauth'));
    expect(screen.getByTestId('zed-xai-oauth-login')).toBeTruthy();
    expect(screen.queryByTestId('zed-xai-api-key-input')).toBeNull();
  });

  test('saving kimi_code provider persists zed.provider and kimi key', async () => {
    global.fetch = jest.fn((url, opts) => {
      if (url.includes('/api/assistant/zed-provider-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            provider: 'kimi_code',
            model: 'kimi-for-coding',
            hasKey: true,
          }),
        });
      }
      if (url.includes('/api/settings/llm-providers') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      if (url.includes('/api/settings/llm-providers')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            settings: { zed: { provider: 'xai' } },
            providers: { minimax: { MINIMAX_API_KEY: 'sk-minimax' } },
            modelOptions: {},
          }),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<ZedModelSettings />);
    await waitFor(() => expect(screen.getByTestId('zed-provider-select')).toBeTruthy());

    fireEvent.change(screen.getByTestId('zed-provider-select'), {
      target: { value: 'kimi_code' },
    });
    fireEvent.change(screen.getByTestId('zed-kimi-api-key-input'), {
      target: { value: 'kimi-subscription-key-1234567890' },
    });
    fireEvent.click(screen.getByTestId('zed-model-save-button'));

    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(
        ([url, opts]) => url === '/api/settings/llm-providers' && opts?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const savedBody = JSON.parse(postCall[1].body);
      expect(savedBody.settings.zed.provider).toBe('kimi_code');
      expect(savedBody.providers.kimi_code.KIMI_CODE_API_KEY).toBe(
        'kimi-subscription-key-1234567890'
      );
    });
  });

  test('kimi_code model sync calls models endpoint and populates the dropdown', async () => {
    global.fetch = jest.fn((url, opts) => {
      if (url.includes('/api/assistant/zed-provider-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ provider: 'kimi_code', model: 'kimi-for-coding', hasKey: true }),
        });
      }
      if (url.includes('/api/settings/llm-providers/models') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ models: ['kimi-for-coding', 'kimi-k2-coding'] }),
        });
      }
      if (url.includes('/api/settings/llm-providers')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            settings: { zed: { provider: 'kimi_code' } },
            providers: { kimi_code: { KIMI_CODE_API_KEY: 'kimi-key-1234567890', enabled: true } },
            modelOptions: {},
          }),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<ZedModelSettings />);
    await waitFor(() => expect(screen.getByTestId('zed-provider-select').value).toBe('kimi_code'));

    fireEvent.click(screen.getByTestId('zed-kimi-refresh-models'));

    await waitFor(() => {
      const modelsCall = global.fetch.mock.calls.find(([url]) =>
        url.includes('/api/settings/llm-providers/models')
      );
      expect(modelsCall).toBeTruthy();
      const body = JSON.parse(modelsCall[1].body);
      expect(body.provider).toBe('kimi_code');
      expect(body.config.KIMI_CODE_API_KEY).toBe('kimi-key-1234567890');
    });

    const select = screen.getByTestId('zed-kimi-model-select');
    await waitFor(() => {
      const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);
      expect(options).toEqual(['kimi-for-coding', 'kimi-k2-coding']);
    });
  });

  test('minimax panel shows toggle, key input and test button; save persists providers.minimax', async () => {
    global.fetch = jest.fn((url, opts) => {
      if (url.includes('/api/assistant/zed-provider-status')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ provider: 'minimax', model: 'MiniMax-M3', hasKey: true }),
        });
      }
      if (url.includes('/api/settings/llm-providers/test')) {
        return Promise.resolve({ ok: true, json: async () => ({ valid: true }) });
      }
      if (url.includes('/api/settings/llm-providers') && opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
      }
      if (url.includes('/api/settings/llm-providers')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            settings: { zed: { provider: 'minimax' } },
            providers: { minimax: { MINIMAX_API_KEY: 'mm-stored-key', enabled: true } },
            modelOptions: {},
          }),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<ZedModelSettings />);
    await waitFor(() => expect(screen.getByTestId('zed-provider-select').value).toBe('minimax'));

    expect(screen.getByTestId('zed-minimax-api-key-input').value).toBe('mm-stored-key');
    expect(screen.getByTestId('zed-model-minimax-enabled-toggle')).toBeTruthy();

    const testButton = screen.getByTestId('zed-model-test-button');
    expect(testButton.disabled).toBe(false);
    fireEvent.click(testButton);
    await waitFor(() => {
      const testCall = global.fetch.mock.calls.find(([url]) =>
        url.includes('/api/settings/llm-providers/test')
      );
      expect(testCall).toBeTruthy();
      const body = JSON.parse(testCall[1].body);
      expect(body.provider).toBe('minimax');
      expect(body.config.MINIMAX_API_KEY).toBe('mm-stored-key');
    });

    fireEvent.change(screen.getByTestId('zed-minimax-api-key-input'), {
      target: { value: 'mm-new-key' },
    });
    fireEvent.click(screen.getByTestId('zed-model-minimax-enabled-toggle'));
    fireEvent.click(screen.getByTestId('zed-model-save-button'));

    await waitFor(() => {
      const postCall = global.fetch.mock.calls.find(
        ([url, opts]) => url === '/api/settings/llm-providers' && opts?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const savedBody = JSON.parse(postCall[1].body);
      expect(savedBody.settings.zed.provider).toBe('minimax');
      expect(savedBody.providers.minimax.MINIMAX_API_KEY).toBe('mm-new-key');
      expect(savedBody.providers.minimax.enabled).toBe(false);
    });
  });
});
