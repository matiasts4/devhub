/**
 * Tests for swarmRoleMeta utility functions.
 * TDD: Written BEFORE production code exists.
 */

const {
  SWARM_ROLE_ORDER,
  SWARM_ROLE_META,
  inferSwarmRoleKey,
  buildSwarmRoleMetadata,
  getSwarmRoleOrder,
  getSwarmSnapshotStorageKey,
} = require('../terminal/utils/swarmRoleMeta');

describe('SWARM_ROLE_ORDER', () => {
  test('contains all expected roles in priority order', () => {
    expect(SWARM_ROLE_ORDER).toContain('coder');
    expect(SWARM_ROLE_ORDER).toContain('auditor');
    expect(SWARM_ROLE_ORDER).toContain('architect');
    expect(SWARM_ROLE_ORDER).toContain('qa');
    expect(SWARM_ROLE_ORDER.indexOf('coder')).toBeLessThan(SWARM_ROLE_ORDER.indexOf('qa'));
  });
});

describe('SWARM_ROLE_META', () => {
  test('has metadata for each role with label, abbrev, rgb', () => {
    expect(SWARM_ROLE_META.coder).toEqual({
      label: 'Coder',
      abbrev: 'COD',
      rgb: '34,197,94',
    });
    expect(SWARM_ROLE_META.director).toEqual({
      label: 'Director',
      abbrev: 'DIR',
      rgb: '245,158,11',
    });
  });
});

describe('getSwarmSnapshotStorageKey', () => {
  test('returns key with projectId when provided', () => {
    expect(getSwarmSnapshotStorageKey('proj-123')).toBe('devhub_swarm_control_snapshot:proj-123');
  });

  test('returns default key without projectId', () => {
    expect(getSwarmSnapshotStorageKey()).toBe('devhub_swarm_control_snapshot');
    expect(getSwarmSnapshotStorageKey(null)).toBe('devhub_swarm_control_snapshot');
  });
});

describe('inferSwarmRoleKey', () => {
  test('returns normalized roleKey from explicit input', () => {
    expect(inferSwarmRoleKey({ roleKey: 'coder' })).toBe('coder');
    expect(inferSwarmRoleKey({ role_key: 'dev_ops' })).toBe('dev_ops');
  });

  test('extracts role from taskId with colon separator', () => {
    expect(inferSwarmRoleKey({ taskId: 'task-1:auditor' })).toBe('auditor');
  });

  test('infers role from text containing known role names', () => {
    expect(inferSwarmRoleKey({ roleLabel: 'Architect role' })).toBe('architect');
    expect(inferSwarmRoleKey({ promptSummary: 'QA testing needed' })).toBe('qa');
  });

  test('returns empty string when no role can be inferred', () => {
    expect(inferSwarmRoleKey({})).toBe('');
    expect(inferSwarmRoleKey({ roleLabel: 'unknown' })).toBe('');
  });
});

describe('buildSwarmRoleMetadata', () => {
  test('returns null when no role can be inferred', () => {
    expect(buildSwarmRoleMetadata({})).toBeNull();
  });

  test('returns metadata for known roles from SWARM_ROLE_META', () => {
    const meta = buildSwarmRoleMetadata({ roleKey: 'coder' });
    expect(meta).toEqual({
      roleKey: 'coder',
      label: 'Coder',
      abbrev: 'COD',
      rgb: '34,197,94',
    });
  });

  test('uses fallback for unknown roles', () => {
    const meta = buildSwarmRoleMetadata({ roleKey: 'custom_role' });
    expect(meta).not.toBeNull();
    expect(meta.roleKey).toBe('custom_role');
    expect(meta.abbrev).toBe('CUS');
  });

  test('overrides label and abbrev from input when provided', () => {
    const meta = buildSwarmRoleMetadata({
      roleKey: 'coder',
      roleLabel: 'Senior Coder',
      roleAbbrev: 'SCD',
    });
    expect(meta.label).toBe('Senior Coder');
    expect(meta.abbrev).toBe('SCD');
    expect(meta.rgb).toBe('34,197,94'); // from SWARM_ROLE_META
  });
});

describe('getSwarmRoleOrder', () => {
  test('returns 999 for director', () => {
    expect(getSwarmRoleOrder('director')).toBe(999);
  });

  test('returns index for known roles', () => {
    // Derive from SWARM_ROLE_ORDER so the test survives reordering
    // (sdd_worker_1..4 were prepended ahead of coder/auditor).
    expect(getSwarmRoleOrder('coder')).toBe(SWARM_ROLE_ORDER.indexOf('coder'));
    expect(getSwarmRoleOrder('auditor')).toBe(SWARM_ROLE_ORDER.indexOf('auditor'));
    expect(getSwarmRoleOrder('coder')).toBeLessThan(getSwarmRoleOrder('auditor'));
  });

  test('returns 500 for unknown roles', () => {
    expect(getSwarmRoleOrder('unknown')).toBe(500);
  });

  test('returns 500 for empty string', () => {
    expect(getSwarmRoleOrder('')).toBe(500);
  });
});
