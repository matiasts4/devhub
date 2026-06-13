'use strict';

const { ACTION_REGISTRY, getAction, listActions } = require('../action-registry');

describe('action-registry', () => {
  describe('ACTION_REGISTRY', () => {
    it('is frozen at module load', () => {
      expect(Object.isFrozen(ACTION_REGISTRY)).toBe(true);
    });

    it('contains only known action ids', () => {
      const known = [
        'obs_log_tail', 'obs_log_search', 'obs_session_list', 'obs_agent_state', 'obs_swarm_status',
        'nav_terminal', 'nav_editor', 'nav_dock', 'nav_browser', 'nav_layout',
        'mut_env_write', 'mut_config_patch', 'mut_session_name', 'mut_layout_save', 'mut_kill_agent',
        'orch_spawn_agent', 'orch_delegate_task', 'orch_submit_mission', 'orch_exec_tool',
        'orch_credential_use', 'orch_credential_export',
      ];
      const ids = Object.keys(ACTION_REGISTRY).sort();
      expect(ids).toEqual(known.sort());
    });

    it('all obs_* are Tier 0', () => {
      const obs = Object.keys(ACTION_REGISTRY).filter(id => id.startsWith('obs_'));
      obs.forEach(id => {
        expect(ACTION_REGISTRY[id].tier).toBe(0);
        expect(ACTION_REGISTRY[id].class).toBe('observe');
      });
    });

    it('all nav_* are Tier 1', () => {
      const nav = Object.keys(ACTION_REGISTRY).filter(id => id.startsWith('nav_'));
      nav.forEach(id => {
        expect(ACTION_REGISTRY[id].tier).toBe(1);
        expect(ACTION_REGISTRY[id].class).toBe('nav');
      });
    });

    it('all mut_* are Tier 2', () => {
      const mut = Object.keys(ACTION_REGISTRY).filter(id => id.startsWith('mut_'));
      mut.forEach(id => {
        expect(ACTION_REGISTRY[id].tier).toBe(2);
        expect(ACTION_REGISTRY[id].class).toBe('mutate');
      });
    });

    it('all orch_* are Tier 3 or Tier 4', () => {
      const orch = Object.keys(ACTION_REGISTRY).filter(id => id.startsWith('orch_'));
      orch.forEach(id => {
        expect([3, 4]).toContain(ACTION_REGISTRY[id].tier);
        expect(ACTION_REGISTRY[id].class).toBe('orchestrate');
      });
    });

    it('orch_credential_export is explicitly Tier 4', () => {
      expect(ACTION_REGISTRY.orch_credential_export.tier).toBe(4);
    });

    it('every action has a label', () => {
      Object.entries(ACTION_REGISTRY).forEach(([id, def]) => {
        expect(typeof def.label).toBe('string');
        expect(def.label.length).toBeGreaterThan(0);
      });
    });

    it('every action has a targetTypes array', () => {
      Object.entries(ACTION_REGISTRY).forEach(([id, def]) => {
        expect(Array.isArray(def.targetTypes)).toBe(true);
      });
    });
  });

  describe('getAction', () => {
    it('returns definition for known action id', () => {
      const def = getAction('obs_log_tail');
      expect(def).toBeDefined();
      expect(def.tier).toBe(0);
      expect(def.class).toBe('observe');
    });

    it('returns undefined for unknown action id', () => {
      expect(getAction('unknown_action')).toBeUndefined();
    });
  });

  describe('listActions', () => {
    it('returns a plain object', () => {
      const listed = listActions();
      expect(typeof listed).toBe('object');
    });

    it('returned object has all registry entries', () => {
      const listed = listActions();
      expect(Object.keys(listed).length).toBe(Object.keys(ACTION_REGISTRY).length);
    });

    it('returned object is not the same reference as the registry', () => {
      const listed = listActions();
      expect(listed).not.toBe(ACTION_REGISTRY);
    });
  });
});