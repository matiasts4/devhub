/**
 * @jest-environment jsdom
 */

import {
  readZedAuditTrail,
  appendZedAuditEntry,
  recordZedInteraction,
  ZED_AUDIT_STORAGE_KEY,
} from '../zedAuditTrail';

describe('zedAuditTrail', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('returns empty array when sessionStorage is empty', () => {
    expect(readZedAuditTrail()).toEqual([]);
  });

  it('appends entries and reads them back', () => {
    appendZedAuditEntry({ userMessage: 'hola', note: 'test' });
    const entries = readZedAuditTrail();
    expect(entries).toHaveLength(1);
    expect(entries[0].userMessage).toBe('hola');
    expect(entries[0].note).toBe('test');
    expect(entries[0].ts).toMatch(/\d{4}-/);
  });

  it('caps entries at MAX_ENTRIES', () => {
    for (let i = 0; i < 90; i += 1) {
      appendZedAuditEntry({ userMessage: `msg-${i}` });
    }
    expect(readZedAuditTrail().length).toBeLessThanOrEqual(80);
    expect(readZedAuditTrail()[0].userMessage).toBe('msg-10');
  });

  it('records interaction with parsed results', () => {
    recordZedInteraction('abre terminal', [
      { tool: 'open_terminal', input: { program: 'node' }, result: '{"opened":true}' },
    ]);
    const entries = readZedAuditTrail();
    expect(entries).toHaveLength(1);
    expect(entries[0].tools[0].tool).toBe('open_terminal');
    expect(entries[0].tools[0].result).toEqual({ opened: true });
    expect(entries[0].tools[0].ok).toBe(true);
  });

  it('dispatches audit updated event', () => {
    const listener = jest.fn();
    window.addEventListener('devhub:zed-audit-updated', listener);
    appendZedAuditEntry({ note: 'event-test' });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('devhub:zed-audit-updated', listener);
  });

  it('survives corrupt sessionStorage', () => {
    window.sessionStorage.setItem(ZED_AUDIT_STORAGE_KEY, 'not json');
    expect(readZedAuditTrail()).toEqual([]);
  });
});
