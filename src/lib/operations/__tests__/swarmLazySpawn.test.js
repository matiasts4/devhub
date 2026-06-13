import { describe, expect, test } from '@jest/globals';
import {
  SWARM_SPAWN_STRATEGY_LAZY,
  appendPendingUiProvision,
  buildProvisionedWorkerKey,
  consumePendingUiProvision,
  findDirectorPanelInColumns,
  insertWorkerPanelIntoGrowingSwarmColumns,
  isLazyOnDemandSpawnStrategy,
  partitionRuntimeRequestsForSpawnStrategy,
} from '@/lib/operations/swarmLazySpawn';

describe('swarmLazySpawn', () => {
  test('isLazyOnDemandSpawnStrategy recognizes lazy-on-demand', () => {
    expect(isLazyOnDemandSpawnStrategy(SWARM_SPAWN_STRATEGY_LAZY)).toBe(true);
    expect(isLazyOnDemandSpawnStrategy('automatic')).toBe(false);
  });

  test('partitionRuntimeRequestsForSpawnStrategy defers workers only', () => {
    const requests = [
      { roleKey: 'zed', taskId: 'launch-1:zed' },
      { roleKey: 'sdd_worker_1', taskId: 'launch-1:sdd_worker_1' },
      { roleKey: 'sdd_worker_2', taskId: 'launch-1:sdd_worker_2' },
    ];
    const { materialized, deferred } = partitionRuntimeRequestsForSpawnStrategy(
      requests,
      SWARM_SPAWN_STRATEGY_LAZY
    );
    expect(materialized).toHaveLength(1);
    expect(materialized[0].roleKey).toBe('zed');
    expect(deferred).toHaveLength(2);
  });

  test('insertWorkerPanelIntoGrowingSwarmColumns grows from ZED-only to workers+ZED', () => {
    const zedPanel = { id: 'p1', swarmContext: { roleKey: 'zed', launchId: 'launch-1' } };
    const w1Panel = { id: 'p2', swarmContext: { roleKey: 'sdd_worker_1', launchId: 'launch-1' } };

    const first = insertWorkerPanelIntoGrowingSwarmColumns(
      [{ id: 'c1', panels: [zedPanel] }],
      w1Panel,
      'p1'
    );
    expect(first).toHaveLength(2);
    expect(first[0].panels).toHaveLength(1);
    expect(first[1].panels[0].id).toBe('p1');

    const second = insertWorkerPanelIntoGrowingSwarmColumns(
      first,
      {
        id: 'p3',
        swarmContext: { roleKey: 'sdd_worker_2', launchId: 'launch-1' },
      },
      'p1'
    );
    expect(second[0].panels).toHaveLength(2);
  });

  test('findDirectorPanelInColumns resolves orchestrator panel', () => {
    const columns = [
      { panels: [{ id: 'p2', swarmContext: { roleKey: 'sdd_worker_1' } }] },
      { panels: [{ id: 'p1', swarmContext: { roleKey: 'zed' } }] },
    ];
    expect(findDirectorPanelInColumns(columns)?.id).toBe('p1');
  });

  test('pending ui provision queue append and consume', () => {
    const metadata = { launchId: 'launch-1', provisionedRoleKeys: [] };
    const runtimeRequest = { launchId: 'launch-1', roleKey: 'sdd_worker_1', command: 'bash ...' };
    const queued = appendPendingUiProvision(metadata, runtimeRequest);
    expect(queued.pendingUiProvisions).toHaveLength(1);
    expect(queued.provisionedRoleKeys).toContain('sdd_worker_1');

    const consumed = consumePendingUiProvision(queued, 'launch-1', 'sdd_worker_1');
    expect(consumed.pendingUiProvisions).toHaveLength(0);
  });

  test('buildProvisionedWorkerKey is stable', () => {
    expect(buildProvisionedWorkerKey('launch-1', 'sdd_worker_2')).toBe('launch-1:sdd_worker_2');
  });
});
