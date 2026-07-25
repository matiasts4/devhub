// Strict TDD — RED: tests written before implementation
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({ status: init.status ?? 200, json: async () => body }),
  },
}));

function makeMockFetch(responseRow) {
  return jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ row: responseRow }),
  });
}

function fullRow(overrides = {}) {
  return {
    id: 'server-id',
    timestamp: 1234567890,
    initiator: 'operator',
    target: 'swarm-director',
    action: 'mission-request',
    status: 'pending',
    authority: 'operator-initiated',
    freshness: 'just_now',
    fallback: '',
    missionId: 'mission-1',
    ...overrides,
  };
}

describe('DG timeline row factory', () => {
  describe('emitRow — action/status matrix', () => {
    test('mission-request + pending produces correct row shape', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(
        fullRow({
          action: 'mission-request',
          status: 'pending',
          fallback: 'Operator puede aprobar o cancelar.',
        })
      );
      const row = await emitRow(
        'mission-request',
        'pending',
        {
          missionId: 'mission-1',
          initiator: 'operator',
          target: 'swarm-director',
          authority: 'operator-initiated',
          fallback: 'Operator puede aprobar o cancelar.',
        },
        mockFetch
      );

      expect(row).toMatchObject({
        id: 'server-id',
        missionId: 'mission-1',
        initiator: 'operator',
        target: 'swarm-director',
        action: 'mission-request',
        status: 'pending',
        authority: 'operator-initiated',
        fallback: 'Operator puede aprobar o cancelar.',
      });
      expect(typeof row.timestamp).toBe('number');
    });

    test('status-poll + in-progress produces correct row shape', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(
        fullRow({ action: 'status-poll', status: 'in-progress', initiator: 'director-general' })
      );
      const row = await emitRow(
        'status-poll',
        'in-progress',
        {
          missionId: 'mission-1',
          initiator: 'director-general',
          target: 'swarm-director',
          authority: 'operator-initiated',
          freshness: 'just_now',
        },
        mockFetch
      );

      expect(row).toMatchObject({
        action: 'status-poll',
        status: 'in-progress',
        initiator: 'director-general',
        target: 'swarm-director',
      });
    });

    test('approval-required + awaiting-approval produces correct row shape', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(
        fullRow({
          action: 'approval-required',
          status: 'awaiting-approval',
          initiator: 'swarm-director',
          target: 'operator',
          authority: 'operator',
        })
      );
      const row = await emitRow(
        'approval-required',
        'awaiting-approval',
        {
          missionId: 'mission-1',
          initiator: 'swarm-director',
          target: 'operator',
          authority: 'operator',
          fallback: '',
        },
        mockFetch
      );

      expect(row).toMatchObject({
        action: 'approval-required',
        status: 'awaiting-approval',
        initiator: 'swarm-director',
        target: 'operator',
        authority: 'operator',
      });
    });

    test('mission-result + completed produces correct row shape', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(
        fullRow({
          action: 'mission-result',
          status: 'completed',
          initiator: 'swarm-director',
          target: 'operator',
          authority: 'director',
        })
      );
      const row = await emitRow(
        'mission-result',
        'completed',
        {
          missionId: 'mission-1',
          initiator: 'swarm-director',
          target: 'operator',
          authority: 'director',
          fallback: '',
        },
        mockFetch
      );

      expect(row).toMatchObject({
        action: 'mission-result',
        status: 'completed',
        initiator: 'swarm-director',
        target: 'operator',
        authority: 'director',
      });
    });

    test('mission-result + failed produces row with fallback', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(
        fullRow({
          action: 'mission-result',
          status: 'failed',
          authority: 'director-escalated',
          fallback: 'Contactá al supervisor directo.',
        })
      );
      const row = await emitRow(
        'mission-result',
        'failed',
        {
          missionId: 'mission-1',
          initiator: 'swarm-director',
          target: 'operator',
          authority: 'director-escalated',
          fallback: 'Contactá al supervisor directo.',
        },
        mockFetch
      );

      expect(row).toMatchObject({
        status: 'failed',
        authority: 'director-escalated',
        fallback: 'Contactá al supervisor directo.',
      });
    });

    test('status-poll + waiting produces correct row shape', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(fullRow({ action: 'status-poll', status: 'waiting' }));
      const row = await emitRow(
        'status-poll',
        'waiting',
        {
          missionId: 'mission-1',
          initiator: 'director-general',
          target: 'swarm-director',
          authority: 'operator-initiated',
        },
        mockFetch
      );

      expect(row).toMatchObject({ action: 'status-poll', status: 'waiting' });
    });

    test('status-poll + rejected produces correct row shape', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(fullRow({ action: 'status-poll', status: 'rejected' }));
      const row = await emitRow(
        'status-poll',
        'rejected',
        {
          missionId: 'mission-1',
          initiator: 'director-general',
          target: 'swarm-director',
          authority: 'operator-initiated',
        },
        mockFetch
      );

      expect(row).toMatchObject({ action: 'status-poll', status: 'rejected' });
    });
  });

  describe('emitRow — authority validation (DG MUST NOT)', () => {
    test('throws when initiator=operator and authority=director', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(fullRow());

      await expect(
        emitRow(
          'mission-request',
          'pending',
          {
            missionId: 'mission-1',
            initiator: 'operator',
            target: 'swarm-director',
            authority: 'director',
          },
          mockFetch
        )
      ).rejects.toThrow(/authority.*no es válido/i);
    });

    test('throws when initiator=director-general and authority=director-escalated', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(fullRow());

      await expect(
        emitRow(
          'status-poll',
          'in-progress',
          {
            missionId: 'mission-1',
            initiator: 'director-general',
            target: 'swarm-director',
            authority: 'director-escalated',
          },
          mockFetch
        )
      ).rejects.toThrow(/authority.*no es válido/i);
    });

    test('throws when initiator=swarm-director and authority=operator-initiated', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(fullRow());

      await expect(
        emitRow(
          'mission-result',
          'completed',
          {
            missionId: 'mission-1',
            initiator: 'swarm-director',
            target: 'operator',
            authority: 'operator-initiated',
          },
          mockFetch
        )
      ).rejects.toThrow(/authority.*no es válido/i);
    });
  });

  describe('emitRow — fallback default', () => {
    test('fallback defaults to empty string when not provided', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(fullRow({ fallback: '' }));
      const row = await emitRow(
        'mission-request',
        'pending',
        {
          missionId: 'mission-1',
          initiator: 'operator',
          target: 'swarm-director',
          authority: 'operator-initiated',
        },
        mockFetch
      );

      expect(row.fallback).toBe('');
    });
  });

  describe('emitRow — POST behavior', () => {
    test('POSTs to the correct timeline endpoint', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch(fullRow());

      await emitRow(
        'mission-request',
        'pending',
        {
          missionId: 'mission-xyz',
          initiator: 'operator',
          target: 'swarm-director',
          authority: 'operator-initiated',
        },
        mockFetch
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/agenthub/swarm/mission-xyz/timeline'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('returns server-assigned id and timestamp from response', async () => {
      const { emitRow } = require('../timeline');
      const mockFetch = makeMockFetch({ id: 'server-assigned-id', timestamp: 9999999999 });
      const row = await emitRow(
        'mission-request',
        'pending',
        {
          missionId: 'mission-1',
          initiator: 'operator',
          target: 'swarm-director',
          authority: 'operator-initiated',
        },
        mockFetch
      );

      expect(row.id).toBe('server-assigned-id');
      expect(row.timestamp).toBe(9999999999);
    });
  });
});
