const {
  interpolate,
  buildPhaseContractPrompt,
  buildStandardPrompt,
  buildPrompt,
  getPromptMode,
  getExecutablePhases,
  getDelegatablePhases,
  canExecutePhase,
  getContextBudget,
  SDD_PHASES,
  PHASE_CONTRACTS,
  buildPhaseContractSection,
} = require('../SwarmPromptEngine');

describe('SwarmPromptEngine', () => {
  describe('interpolate()', () => {
    test('interpolates all known variables', () => {
      const template = 'Change: {{change_name}}, Phase: {{phase}}, Role: {{role}}';
      const result = interpolate(template, {
        change_name: 'auth-overhaul',
        phase: 'sdd-apply',
        role: 'coder',
      });
      expect(result).toBe('Change: auth-overhaul, Phase: sdd-apply, Role: coder');
    });

    test('leaves unknown variables as placeholders', () => {
      const template = 'Mission: {{mission_id}}, Session: {{session_id}}';
      const result = interpolate(template, {});
      expect(result).toBe('Mission: {{mission_id}}, Session: {{session_id}}');
    });

    test('returns non-string inputs unchanged', () => {
      expect(interpolate(null)).toBeNull();
      expect(interpolate(undefined)).toBeUndefined();
      expect(interpolate(123)).toBe(123);
    });

    test('handles missing variables gracefully', () => {
      const template = '{{change_name}} - {{missing}}';
      const result = interpolate(template, { change_name: 'test' });
      expect(result).toBe('test - {{missing}}');
    });

    test('interpolates artifacts and mission_id', () => {
      const template = 'Mission {{mission_id}} with artifacts {{artifacts}}';
      const result = interpolate(template, {
        mission_id: 'm-123',
        artifacts: 'spec, design',
      });
      expect(result).toBe('Mission m-123 with artifacts spec, design');
    });
  });

  describe('buildPhaseContractSection()', () => {
    test('builds section for director role', () => {
      const section = buildPhaseContractSection('director', 'sdd-design');
      expect(section).toContain('## Phase Contract');
      expect(section).toContain('**director**');
      expect(section).toContain('sdd-explore');
      expect(section).toContain('sdd-propose');
      expect(section).toContain('sdd-design');
      expect(section).toContain('~8000 tokens');
    });

    test('builds section for coder role', () => {
      const section = buildPhaseContractSection('coder', 'sdd-apply');
      expect(section).toContain('## Phase Contract');
      expect(section).toContain('**coder**');
      expect(section).toContain('sdd-apply');
      expect(section).not.toContain('delegatable');
    });

    test('defaults to coder contract for unknown roles', () => {
      // Unknown role gets coder's phase list but preserves its role name in output
      const section = buildPhaseContractSection('unknown-role', 'sdd-apply');
      // The contract (executable/delegatable phases) comes from coder default
      expect(section).toContain('sdd-apply');
      expect(section).toContain('none'); // coder has no delegatable phases
      // The role name is preserved as unknown-role
      expect(section).toContain('**unknown-role**');
    });
  });

  describe('buildPhaseContractPrompt()', () => {
    test('builds prompt for architect in sdd-design phase', () => {
      const prompt = buildPhaseContractPrompt('architect', 'sdd-design', {
        change_name: 'auth-overhaul',
        mission_id: 'm-456',
        session_id: 's-789',
        artifacts: 'proposal, spec',
      });

      expect(prompt).toContain('auth-overhaul');
      expect(prompt).toContain('architect');
      expect(prompt).toContain('sdd-design');
      expect(prompt).toContain('m-456');
      expect(prompt).toContain('s-789');
      expect(prompt).toContain('## Phase Contract');
      expect(prompt).toContain('## Context Budget');
      expect(prompt).toContain('## Reactivation Contract');
    });

    test('throws on invalid SDD phase', () => {
      expect(() => buildPhaseContractPrompt('coder', 'invalid-phase')).toThrow('Invalid SDD phase');
    });

    test('uses defaults when vars are missing', () => {
      const prompt = buildPhaseContractPrompt('coder', 'sdd-apply', {});
      expect(prompt).toContain('unknown-change');
      expect(prompt).toContain('coder');
      expect(prompt).toContain('sdd-apply');
    });

    test('produces prompt under token budget for MiniMax 2.7', () => {
      const prompt = buildPhaseContractPrompt('director', 'sdd-design', {
        change_name: 'big-change',
        mission_id: 'm-large',
        session_id: 's-large',
      });
      // Rough token estimate: ~4 chars per token
      const estimatedTokens = Math.ceil(prompt.length / 4);
      expect(estimatedTokens).toBeLessThan(8000);
    });
  });

  describe('buildStandardPrompt()', () => {
    test('builds standard prompt without SDD context', () => {
      const prompt = buildStandardPrompt('coder', {
        mission_id: 'm-123',
      });
      expect(prompt).toContain('coder');
      expect(prompt).toContain('DevHub swarm');
      expect(prompt).toContain('m-123');
      expect(prompt).not.toContain('Phase Contract');
    });
  });

  describe('getPromptMode()', () => {
    test('returns phase-contract when forcePhaseContract is true', () => {
      expect(getPromptMode({ forcePhaseContract: true })).toBe('phase-contract');
    });

    test('returns standard when forceStandard is true', () => {
      expect(getPromptMode({ forceStandard: true })).toBe('standard');
    });

    test('respects SDD_ENABLED env var', () => {
      const original = process.env.SDD_ENABLED;
      process.env.SDD_ENABLED = 'true';
      expect(getPromptMode({})).toBe('phase-contract');

      delete process.env.SDD_ENABLED;
      expect(getPromptMode({})).toBe('phase-contract');

      process.env.SDD_ENABLED = 'false';
      expect(getPromptMode({})).toBe('standard');

      process.env.SDD_ENABLED = original;
    });
  });

  describe('buildPrompt()', () => {
    test('builds phase-contract prompt when SDD_ENABLED=true', () => {
      const original = process.env.SDD_ENABLED;
      process.env.SDD_ENABLED = 'true';
      const prompt = buildPrompt('architect', 'sdd-design', {
        change_name: 'test',
      });
      expect(prompt).toContain('Phase Contract');
      process.env.SDD_ENABLED = original;
    });

    test('builds standard prompt when SDD_ENABLED=false', () => {
      const original = process.env.SDD_ENABLED;
      process.env.SDD_ENABLED = 'false';
      const prompt = buildPrompt('coder', 'sdd-apply', {
        mission_id: 'm-123',
      });
      expect(prompt).not.toContain('Phase Contract');
      process.env.SDD_ENABLED = original;
    });

    test('builds phase-contract prompt when SDD_ENABLED is not set', () => {
      const original = process.env.SDD_ENABLED;
      delete process.env.SDD_ENABLED;
      const prompt = buildPrompt('coder', 'sdd-apply', {
        mission_id: 'm-123',
      });
      expect(prompt).toContain('Phase Contract');
      process.env.SDD_ENABLED = original;
    });
  });

  describe('role phase accessors', () => {
    test('getExecutablePhases returns correct phases per role', () => {
      expect(getExecutablePhases('director')).toEqual(['sdd-explore', 'sdd-propose', 'sdd-design']);
      expect(getExecutablePhases('architect')).toEqual(['sdd-design']);
      expect(getExecutablePhases('coder')).toEqual(['sdd-apply']);
      expect(getExecutablePhases('qa')).toEqual(['sdd-verify']);
    });

    test('getDelegatablePhases returns correct phases per role', () => {
      expect(getDelegatablePhases('director')).toEqual([
        'sdd-spec',
        'sdd-tasks',
        'sdd-apply',
        'sdd-verify',
        'sdd-archive',
      ]);
      expect(getDelegatablePhases('coder')).toEqual([]);
      expect(getDelegatablePhases('auditor')).toEqual([]);
    });

    test('canExecutePhase validates correctly', () => {
      expect(canExecutePhase('director', 'sdd-explore')).toBe(true);
      expect(canExecutePhase('director', 'sdd-apply')).toBe(false);
      expect(canExecutePhase('coder', 'sdd-apply')).toBe(true);
      expect(canExecutePhase('coder', 'sdd-design')).toBe(false);
    });

    test('getContextBudget returns correct budget per role', () => {
      expect(getContextBudget('director')).toBe(8000);
      expect(getContextBudget('qa')).toBe(8000);
      expect(getContextBudget('unknown')).toBe(8000);
    });
  });

  describe('SDD_PHASES constant', () => {
    test('contains all 8 SDD phases in order', () => {
      expect(SDD_PHASES).toEqual([
        'sdd-explore',
        'sdd-propose',
        'sdd-spec',
        'sdd-design',
        'sdd-tasks',
        'sdd-apply',
        'sdd-verify',
        'sdd-archive',
      ]);
    });
  });

  describe('PHASE_CONTRACTS coverage', () => {
    test('all 8 swarm roles have contracts', () => {
      const roles = [
        'director',
        'architect',
        'coder',
        'explorer',
        'qa',
        'reviewer',
        'devops',
        'auditor',
        'zed',
      ];
      for (const role of roles) {
        expect(PHASE_CONTRACTS[role]).toBeDefined();
        expect(PHASE_CONTRACTS[role].contextBudget).toBe(8000);
        expect(Array.isArray(PHASE_CONTRACTS[role].executable)).toBe(true);
        expect(Array.isArray(PHASE_CONTRACTS[role].delegatable)).toBe(true);
      }
    });
  });
});
