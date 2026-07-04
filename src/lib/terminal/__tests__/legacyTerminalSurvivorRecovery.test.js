/**
 * @jest-environment jsdom
 */

import {
  dispatchTerminalSurvivorRecover,
  filterLegacySurvivorPanelIds,
  scheduleSurvivorRecoverAfterClose,
  SURVIVOR_RECOVER_DELAYS_MS,
  usesLegacyTerminalSurvivorRecovery,
} from '../legacyTerminalSurvivorRecovery.js';

describe('legacyTerminalSurvivorRecovery', () => {
  test('usesLegacyTerminalSurvivorRecovery is false for v2 panels', () => {
    expect(usesLegacyTerminalSurvivorRecovery(true)).toBe(false);
    expect(usesLegacyTerminalSurvivorRecovery(false)).toBe(true);
  });

  test('filterLegacySurvivorPanelIds excludes terminal-engine-v2 panels', () => {
    const engineV2PanelIds = new Set(['p-v2']);
    expect(filterLegacySurvivorPanelIds(['p-v1', 'p-v2', 'p-v1b'], engineV2PanelIds)).toEqual([
      'p-v1',
      'p-v1b',
    ]);
    expect(filterLegacySurvivorPanelIds(['p-v2'], engineV2PanelIds)).toEqual([]);
  });

  test('dispatchTerminalSurvivorRecover dispatches survivor recover event', () => {
    const received = [];
    const handler = (event) => received.push(event.detail);
    window.addEventListener('devhub:terminal-survivor-recover', handler);

    dispatchTerminalSurvivorRecover({ panelIds: ['p1', 'p2'], reason: 'workspace-removed' });

    expect(received).toHaveLength(1);
    expect(received[0].panelIds).toEqual(['p1', 'p2']);
    expect(received[0].reason).toBe('workspace-removed');

    window.removeEventListener('devhub:terminal-survivor-recover', handler);
  });

  test('scheduleSurvivorRecoverAfterClose staggers recover events and can cancel', () => {
    jest.useFakeTimers();
    const received = [];
    const handler = (event) => received.push(event.detail);
    window.addEventListener('devhub:terminal-survivor-recover', handler);

    const cancel = scheduleSurvivorRecoverAfterClose({
      panelIds: ['p1'],
      reason: 'workspace-removed',
    });

    jest.runAllTimers();

    expect(received.length).toBeGreaterThanOrEqual(1);

    cancel();
    const countAfterCancel = received.length;
    jest.runAllTimers();
    expect(received.length).toBe(countAfterCancel);
    expect(received.length).toBeLessThanOrEqual(SURVIVOR_RECOVER_DELAYS_MS.length);

    window.removeEventListener('devhub:terminal-survivor-recover', handler);
    jest.useRealTimers();
  });
});
