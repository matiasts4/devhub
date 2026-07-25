/**
 * @jest-environment node
 */

import { terminalRead } from '../terminalRead';

describe('terminalRead', () => {
  let mockController;

  beforeEach(() => {
    mockController = {
      findTerminalByLabel: jest.fn(),
      focusedTerminal: jest.fn(),
      captureTerminal: jest.fn(),
    };
  });

  it('reads named terminal buffer successfully', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'build-output' },
    };

    mockController.findTerminalByLabel.mockReturnValue({
      id: 'term-123',
      label: 'build-output',
    });
    mockController.captureTerminal.mockResolvedValue('line 1\nline 2\nline 3');

    const result = await terminalRead(intent, mockController);

    expect(mockController.findTerminalByLabel).toHaveBeenCalledWith('build-output');
    expect(mockController.captureTerminal).toHaveBeenCalledWith('term-123');
    expect(result.text).toBe('line 1\nline 2\nline 3');
    expect(result.terminalName).toBe('build-output');
    expect(result.timestamp).toBeTruthy();
    expect(result.truncated).toBe(false);
  });

  it('strips ANSI codes from captured output', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'test' },
    };

    mockController.findTerminalByLabel.mockReturnValue({
      id: 'term-456',
      label: 'test',
    });
    mockController.captureTerminal.mockResolvedValue('\x1B[32mgreen text\x1B[0m');

    const result = await terminalRead(intent, mockController);

    expect(result.text).toBe('green text');
    expect(result.terminalName).toBe('test');
  });

  it('falls back to focused terminal when named terminal not found', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'nonexistent' },
    };

    mockController.findTerminalByLabel.mockReturnValue(null);
    mockController.focusedTerminal.mockReturnValue({
      id: 'term-focused',
      label: 'actual-terminal',
    });
    mockController.captureTerminal.mockResolvedValue('fallback content');

    const result = await terminalRead(intent, mockController);

    expect(mockController.findTerminalByLabel).toHaveBeenCalledWith('nonexistent');
    expect(mockController.focusedTerminal).toHaveBeenCalled();
    expect(mockController.captureTerminal).toHaveBeenCalledWith('term-focused');
    expect(result.text).toBe('fallback content');
    expect(result.terminalName).toBe('actual-terminal');
    expect(result.fallbackUsed).toBe(true);
    expect(result.requestedName).toBe('nonexistent');
  });

  it('fails when no terminals are open', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'test' },
    };

    mockController.findTerminalByLabel.mockReturnValue(null);
    mockController.focusedTerminal.mockReturnValue(null);

    const result = await terminalRead(intent, mockController);

    expect(result.error).toBe('No terminals are open');
  });

  it('handles empty buffer gracefully', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'empty' },
    };

    mockController.findTerminalByLabel.mockReturnValue({
      id: 'term-empty',
      label: 'empty',
    });
    mockController.captureTerminal.mockResolvedValue('');

    const result = await terminalRead(intent, mockController);

    expect(result.text).toBe('');
    expect(result.terminalName).toBe('empty');
    expect(result.error).toBeUndefined();
  });

  it('sets truncated flag for large buffers', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'large' },
    };

    const largeOutput = Array.from({ length: 2000 }, (_, i) => `line ${i + 1}`).join('\n');

    mockController.findTerminalByLabel.mockReturnValue({
      id: 'term-large',
      label: 'large',
    });
    mockController.captureTerminal.mockResolvedValue(largeOutput);

    const result = await terminalRead(intent, mockController);

    expect(result.truncated).toBe(true);
    const lines = result.text.split('\n');
    expect(lines.length).toBe(1000);
    expect(lines[0]).toBe('line 1001');
  });

  it('handles capture errors', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'error' },
    };

    mockController.findTerminalByLabel.mockReturnValue({
      id: 'term-error',
      label: 'error',
    });
    mockController.captureTerminal.mockRejectedValue(
      new Error('Failed to read terminal output: Not Found')
    );

    const result = await terminalRead(intent, mockController);

    expect(result.error).toContain('Failed to read terminal');
  });

  it('reads focused terminal when no terminalName slot provided', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: {},
    };

    mockController.focusedTerminal.mockReturnValue({
      id: 'term-focused',
      label: 'focused-term',
    });
    mockController.captureTerminal.mockResolvedValue('focused content');

    const result = await terminalRead(intent, mockController);

    expect(mockController.focusedTerminal).toHaveBeenCalled();
    expect(result.text).toBe('focused content');
    expect(result.terminalName).toBe('focused-term');
  });

  it('includes timestamp in ISO 8601 format', async () => {
    const intent = {
      intent: 'terminal-read',
      slots: { terminalName: 'test' },
    };

    mockController.findTerminalByLabel.mockReturnValue({
      id: 'term-test',
      label: 'test',
    });
    mockController.captureTerminal.mockResolvedValue('test output');

    const beforeTime = new Date();
    const result = await terminalRead(intent, mockController);
    const afterTime = new Date();

    const timestamp = new Date(result.timestamp);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
  });
});
