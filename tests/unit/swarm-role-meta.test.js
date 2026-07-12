// Tests for swarmRoleMeta.js — pure utility functions for swarm role metadata.
// Strict TDD: RED (file didn't exist) → GREEN (implementation exists) → TRIANGULATE

import {
  SWARM_ROLE_ORDER,
  SWARM_ROLE_META,
  getSwarmSnapshotStorageKey,
  normalizeRoleKey,
  inferSwarmRoleKey,
  buildSwarmRoleMetadata,
  getSwarmRoleOrder,
} from '../../src/components/terminal/utils/swarmRoleMeta';

describe('swarmRoleMeta', () => {
  describe('SWARM_ROLE_ORDER', () => {
    it('contains expected roles in order', () => {
      expect(SWARM_ROLE_ORDER).toContain('coder');
      expect(SWARM_ROLE_ORDER).toContain('architect');
      expect(SWARM_ROLE_ORDER).toContain('qa');
      expect(SWARM_ROLE_ORDER.indexOf('coder')).toBeLessThan(SWARM_ROLE_ORDER.indexOf('qa'));
    });
  });

  describe('SWARM_ROLE_META', () => {
    it('has metadata for known roles', () => {
      expect(SWARM_ROLE_META.coder).toEqual({
        label: 'Coder',
        abbrev: 'COD',
        rgb: '34,197,94',
      });
      expect(SWARM_ROLE_META.architect).toEqual({
        label: 'Architect',
        abbrev: 'ARC',
        rgb: '96,165,250',
      });
    });
  });

  describe('getSwarmSnapshotStorageKey', () => {
    it('includes projectId when provided', () => {
      expect(getSwarmSnapshotStorageKey('proj-123')).toBe('devhub_swarm_control_snapshot:proj-123');
    });

    it('uses default key when projectId is missing', () => {
      expect(getSwarmSnapshotStorageKey()).toBe('devhub_swarm_control_snapshot');
      expect(getSwarmSnapshotStorageKey(null)).toBe('devhub_swarm_control_snapshot');
    });
  });

  describe('normalizeRoleKey', () => {
    it('lowercases and replaces non-alphanumeric with underscores', () => {
      expect(normalizeRoleKey('Dev_Ops')).toBe('dev_ops');
      expect(normalizeRoleKey('Recovery-Ops')).toBe('recovery_ops');
    });

    it('trims leading/trailing underscores', () => {
      expect(normalizeRoleKey('__coder__')).toBe('coder');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeRoleKey('')).toBe('');
      expect(normalizeRoleKey(null)).toBe('');
    });
  });

  describe('inferSwarmRoleKey', () => {
    it('uses explicit roleKey when provided', () => {
      expect(inferSwarmRoleKey({ roleKey: 'coder' })).toBe('coder');
    });

    it('uses role_key alias when provided', () => {
      expect(inferSwarmRoleKey({ role_key: 'architect' })).toBe('architect');
    });

    it('extracts role from taskId with colon separator', () => {
      expect(inferSwarmRoleKey({ taskId: 'task-1:devops' })).toBe('devops');
    });

    it('returns empty string when no role info available', () => {
      expect(inferSwarmRoleKey({})).toBe('');
      expect(inferSwarmRoleKey({ taskTitle: 'some random task' })).toBe('');
    });
  });

  describe('buildSwarmRoleMetadata', () => {
    it('returns null when no role can be inferred', () => {
      expect(buildSwarmRoleMetadata({})).toBeNull();
    });

    it('builds metadata from explicit roleKey', () => {
      const result = buildSwarmRoleMetadata({ roleKey: 'coder' });
      expect(result).toEqual({
        roleKey: 'coder',
        label: 'Coder',
        abbrev: 'COD',
        rgb: '34,197,94',
      });
    });

    it('uses fallback for unknown roles', () => {
      const result = buildSwarmRoleMetadata({ roleKey: 'custom_role' });
      expect(result).toEqual({
        roleKey: 'custom_role',
        label: 'Custom Role',
        abbrev: 'CUS',
        rgb: '148,163,184',
      });
    });

    it('respects custom roleLabel override', () => {
      const result = buildSwarmRoleMetadata({ roleKey: 'coder', roleLabel: 'Senior Coder' });
      expect(result.label).toBe('Senior Coder');
      expect(result.roleKey).toBe('coder');
    });
  });

  describe('getSwarmRoleOrder', () => {
    it('returns 999 for director', () => {
      expect(getSwarmRoleOrder('director')).toBe(999);
    });

    it('returns index for known roles', () => {
      // Derive from SWARM_ROLE_ORDER so the test survives reordering
      // (sdd_worker_1..4 were prepended ahead of coder/auditor).
      expect(getSwarmRoleOrder('coder')).toBe(SWARM_ROLE_ORDER.indexOf('coder'));
      expect(getSwarmRoleOrder('auditor')).toBe(SWARM_ROLE_ORDER.indexOf('auditor'));
      expect(getSwarmRoleOrder('coder')).toBeLessThan(getSwarmRoleOrder('auditor'));
    });

    it('returns 500 for unknown roles', () => {
      expect(getSwarmRoleOrder('unknown_role')).toBe(500);
    });

    it('returns 500 for empty string', () => {
      expect(getSwarmRoleOrder('')).toBe(500);
    });
  });
});
