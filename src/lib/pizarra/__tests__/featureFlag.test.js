/**
 * featureFlag.js — runtime feature flags for pizarra-shared-view-state.
 *
 * Contract (this file pins):
 *   1. `isPizarraSharedViewEnabled()` returns a boolean.
 *   2. The default is ON in dev (NODE_ENV !== 'production') and
 *      OFF in production.
 *   3. When `NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE` is set to a
 *      truthy value ('1' | 'true' | 'yes' | 'on', case-insensitive)
 *      the flag returns true regardless of NODE_ENV.
 *   4. When the env var is set to any other value (e.g. '0',
 *      'false', 'no', ''), the flag returns false regardless of
 *      NODE_ENV.
 *   5. `getFlagSource()` returns one of 'env-explicit',
 *      'env-default-dev', 'env-default-prod'.
 *   6. `_resetFlagForTests()` clears the cache so a test that
 *      changes `process.env` between cases gets fresh reads.
 *
 * The flag value is module-scope cached: the first call to
 * `isPizarraSharedViewEnabled()` reads `process.env` and caches
 * the result. Subsequent calls in the same process do not re-read
 * the env. Tests that flip the env between cases MUST call
 * `_resetFlagForTests()`.
 */

describe('featureFlag — defaults', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../featureFlag')];
  });

  test('defaults to ON when NODE_ENV is not "production" and no env var is set', () => {
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NODE_ENV = 'development';
    const { isPizarraSharedViewEnabled } = require('../featureFlag');
    expect(isPizarraSharedViewEnabled()).toBe(true);
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
    if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
  });

  test('defaults to OFF in production when no env var is set', () => {
    const prev = process.env.NODE_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NODE_ENV = 'production';
    const { isPizarraSharedViewEnabled, _resetFlagForTests } = require('../featureFlag');
    _resetFlagForTests();
    expect(isPizarraSharedViewEnabled()).toBe(false);
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
    if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
  });
});

describe('featureFlag — explicit env var', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../featureFlag')];
  });

  test.each(['1', 'true', 'yes', 'on', 'TRUE', 'On', 'YES'])(
    'NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE="%s" enables the flag (even in production)',
    (val) => {
      const prev = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = val;
      process.env.NODE_ENV = 'production';
      const { isPizarraSharedViewEnabled, _resetFlagForTests } = require('../featureFlag');
      _resetFlagForTests();
      expect(isPizarraSharedViewEnabled()).toBe(true);
      if (prev === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
      else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prev;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
    }
  );

  test.each(['0', 'false', 'no', 'off', '', 'random'])(
    'NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE="%s" disables the flag (even in dev)',
    (val) => {
      const prev = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
      const prevNodeEnv = process.env.NODE_ENV;
      process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = val;
      process.env.NODE_ENV = 'development';
      const { isPizarraSharedViewEnabled, _resetFlagForTests } = require('../featureFlag');
      _resetFlagForTests();
      expect(isPizarraSharedViewEnabled()).toBe(false);
      if (prev === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
      else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prev;
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
    }
  );
});

describe('featureFlag — getFlagSource diagnostics', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../featureFlag')];
  });

  test('reports env-default-dev when env var is unset in dev', () => {
    const prev = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    const prevNodeEnv = process.env.NODE_ENV;
    delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NODE_ENV = 'development';
    const { getFlagSource, _resetFlagForTests } = require('../featureFlag');
    _resetFlagForTests();
    expect(getFlagSource()).toBe('env-default-dev');
    if (prev === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prev;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  test('reports env-default-prod when env var is unset in production', () => {
    const prev = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    const prevNodeEnv = process.env.NODE_ENV;
    delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NODE_ENV = 'production';
    const { getFlagSource, _resetFlagForTests } = require('../featureFlag');
    _resetFlagForTests();
    expect(getFlagSource()).toBe('env-default-prod');
    if (prev === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prev;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  test('reports env-explicit when env var is set', () => {
    const prev = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = 'true';
    const { getFlagSource, _resetFlagForTests } = require('../featureFlag');
    _resetFlagForTests();
    expect(getFlagSource()).toBe('env-explicit');
    if (prev === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prev;
  });
});

describe('featureFlag — getRolloutStage (B.1)', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../featureFlag')];
  });

  test('returns dev when NODE_ENV is not production', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    const { getRolloutStage, _resetFlagForTests } = require('../featureFlag');
    _resetFlagForTests();
    expect(getRolloutStage()).toBe('dev');
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
  });

  test('returns prod in production when env var is unset (default OFF)', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NODE_ENV = 'production';
    delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    const { getRolloutStage, _resetFlagForTests } = require('../featureFlag');
    _resetFlagForTests();
    expect(getRolloutStage()).toBe('prod');
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
  });

  test('returns staging in production when env var is explicitly set', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = '1';
    const { getRolloutStage, _resetFlagForTests } = require('../featureFlag');
    _resetFlagForTests();
    expect(getRolloutStage()).toBe('staging');
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
  });

  test('returns staging in production when env var is explicitly OFF (kill switch QA)', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevFlag = process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = '0';
    const { getRolloutStage, _resetFlagForTests } = require('../featureFlag');
    _resetFlagForTests();
    expect(getRolloutStage()).toBe('staging');
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevFlag === undefined) delete process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE;
    else process.env.NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE = prevFlag;
  });
});

// pizarra-motion-polish (P-MP-10): the rollout stages for
// NEXT_PUBLIC_PIZARRA_SHARED_VIEW_STATE are documented inline in
// featureFlag.js. The contract test pins the comment strings so
// the rollout stages stay paired with the env var.
describe('featureFlag — rollout stages are documented (P-MP-10)', () => {
  test('featureFlag.js source contains the dev/staging/prod stage labels', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'featureFlag.js'), 'utf8');
    // The rollout stages table uses these exact labels.
    expect(source).toMatch(/dev\s*:/);
    expect(source).toMatch(/staging\s*:/);
    expect(source).toMatch(/prod\s*:/);
  });
});
