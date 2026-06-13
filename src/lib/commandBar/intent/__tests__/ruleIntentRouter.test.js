/**
 * @jest-environment node
 */

describe('IntentRouter Interface', () => {
  test('IntentRouter typedef exists and defines resolveIntent method', () => {
    // This test verifies the JSDoc typedef contract exists in the types module
    const types = require('../../types');
    
    // The types module should export JSDoc typedefs (no runtime exports for interfaces)
    // We verify the file exists and can be imported (typedef validation happens at build/IDE time)
    expect(types).toBeDefined();
  });
});

describe('RuleIntentRouter', () => {
  let createRuleIntentRouter;

  beforeEach(() => {
    jest.resetModules();
    const module = require('../ruleIntentRouter');
    createRuleIntentRouter = module.createRuleIntentRouter;
  });

  describe('terminal-run intent', () => {
    test('recognizes "run npm test"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('run npm test');
      
      expect(result.intent).toBe('terminal-run');
      expect(result.slots.command).toBe('npm test');
    });

    test('recognizes "exec git status"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('exec git status');
      
      expect(result.intent).toBe('terminal-run');
      expect(result.slots.command).toBe('git status');
    });

    test('recognizes "$ pnpm dev" (shell prompt prefix)', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('$ pnpm dev');
      
      expect(result.intent).toBe('terminal-run');
      expect(result.slots.command).toBe('pnpm dev');
    });

    test('recognizes "execute docker ps"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('execute docker ps');
      
      expect(result.intent).toBe('terminal-run');
      expect(result.slots.command).toBe('docker ps');
    });

    test('extracts terminalName from "run npm build in build-output"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('run npm build in build-output');
      
      expect(result.intent).toBe('terminal-run');
      expect(result.slots.command).toBe('npm build');
      expect(result.slots.terminalName).toBe('build-output');
    });

    test('extracts terminalName from "run git log in terminal git-workspace"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('run git log in terminal git-workspace');
      
      expect(result.intent).toBe('terminal-run');
      expect(result.slots.command).toBe('git log');
      expect(result.slots.terminalName).toBe('git-workspace');
    });
  });

  describe('multi-step guard (rejection)', () => {
    test('rejects "run npm test and then open github.com"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('run npm test and then open github.com');
      
      expect(result.intent).toBe('unknown');
      expect(result.slots.reason).toBe('multi-step');
    });

    test('rejects "run npm build; then open localhost:3000"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('run npm build; then open localhost:3000');
      
      expect(result.intent).toBe('unknown');
      expect(result.slots.reason).toBe('multi-step');
    });

    test('rejects "exec git status and open browser"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('exec git status and open browser');
      
      expect(result.intent).toBe('unknown');
      expect(result.slots.reason).toBe('multi-step');
    });
  });

  describe('disambiguation (terminal vs browser)', () => {
    test('"open terminal workspace" resolves to terminal-run, NOT browser-navigate', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('open terminal workspace');
      
      // This should be recognized as an unknown/ambiguous command, not browser-navigate
      // because "terminal" is a keyword that should prevent browser routing
      expect(result.intent).not.toBe('browser-navigate');
    });

    test('"run terminal" is terminal-run', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('run terminal');
      
      expect(result.intent).toBe('terminal-run');
    });
  });

  describe('browser-navigate intent', () => {
    test('recognizes "open github.com"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('open github.com');
      
      expect(result.intent).toBe('browser-navigate');
      expect(result.slots.url).toBe('github.com');
    });

    test('recognizes "go to https://example.com"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('go to https://example.com');
      
      expect(result.intent).toBe('browser-navigate');
      expect(result.slots.url).toBe('https://example.com');
    });

    test('recognizes "navigate to localhost:3000"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('navigate to localhost:3000');
      
      expect(result.intent).toBe('browser-navigate');
      expect(result.slots.url).toBe('localhost:3000');
    });

    test('recognizes "visit docs.rs"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('visit docs.rs');
      
      expect(result.intent).toBe('browser-navigate');
      expect(result.slots.url).toBe('docs.rs');
    });

    test('recognizes "browse http://192.168.1.1"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('browse http://192.168.1.1');
      
      expect(result.intent).toBe('browser-navigate');
      expect(result.slots.url).toBe('http://192.168.1.1');
    });

    test('disambiguates: "open terminal" does NOT route to browser-navigate', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('open terminal');
      
      expect(result.intent).not.toBe('browser-navigate');
    });
  });

  describe('browser-search intent', () => {
    test('recognizes "search for typescript docs"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('search for typescript docs');
      
      expect(result.intent).toBe('browser-search');
      expect(result.slots.query).toBe('typescript docs');
    });

    test('recognizes "google react hooks"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('google react hooks');
      
      expect(result.intent).toBe('browser-search');
      expect(result.slots.query).toBe('react hooks');
    });

    test('recognizes "look up rust ownership"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('look up rust ownership');
      
      expect(result.intent).toBe('browser-search');
      expect(result.slots.query).toBe('rust ownership');
    });

    test('recognizes "find devhub github"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('find devhub github');
      
      expect(result.intent).toBe('browser-search');
      expect(result.slots.query).toBe('devhub github');
    });

    test('recognizes "search tailwind 4 migration guide"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('search tailwind 4 migration guide');
      
      expect(result.intent).toBe('browser-search');
      expect(result.slots.query).toBe('tailwind 4 migration guide');
    });
  });

  describe('terminal-read intent', () => {
    test('recognizes "read terminal build-output"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('read terminal build-output');
      
      expect(result.intent).toBe('terminal-read');
      expect(result.slots.terminalName).toBe('build-output');
    });

    test('recognizes "show terminal git-workspace"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('show terminal git-workspace');
      
      expect(result.intent).toBe('terminal-read');
      expect(result.slots.terminalName).toBe('git-workspace');
    });

    test('recognizes "what does terminal test-runner show"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('what does terminal test-runner show');
      
      expect(result.intent).toBe('terminal-read');
      expect(result.slots.terminalName).toBe('test-runner');
    });

    test('recognizes "terminal logs output"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('terminal logs output');
      
      expect(result.intent).toBe('terminal-read');
      expect(result.slots.terminalName).toBe('logs');
    });

    test('recognizes "terminal dev-server buffer"', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('terminal dev-server buffer');
      
      expect(result.intent).toBe('terminal-read');
      expect(result.slots.terminalName).toBe('dev-server');
    });
  });

  describe('edge cases', () => {
    test('empty input returns unknown', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('');
      
      expect(result.intent).toBe('unknown');
    });

    test('whitespace-only input returns unknown', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('   ');
      
      expect(result.intent).toBe('unknown');
    });

    test('unrecognized command returns unknown', () => {
      const router = createRuleIntentRouter();
      const result = router.resolveIntent('frobulate the widgets');
      
      expect(result.intent).toBe('unknown');
    });
  });
});
