import { applyKimiUsagePayload } from '../server/kimi.js';
import { applyCodexUsagePayload } from '../server/codex.js';
import { applyZaiQuotaPayload } from '../server/zai.js';
import { applyAntigravityStatus } from '../server/antigravity.js';

function baseResult() {
  return {
    providerId: 'test',
    displayName: 'Test',
    isAvailable: true,
    isAuth: true,
    primaryUsagePercent: 0,
    primaryRemainingPercent: 100,
    primaryResetAt: null,
    timeUntilResetMs: null,
    windows: [],
    metadata: {},
    lastUpdatedMs: Date.now(),
    error: null,
  };
}

describe('Kimi /usages payload parsing', () => {
  const realPayload = {
    user: { userId: 'u1', region: 'REGION_OVERSEA', membership: { level: 'LEVEL_INTERMEDIATE' } },
    usage: { limit: '100', used: '1', remaining: '99', resetTime: '2099-07-26T22:17:42.200Z' },
    limits: [
      {
        window: { duration: 300, timeUnit: 'TIME_UNIT_MINUTE' },
        detail: { limit: '100', used: '6', remaining: '94', resetTime: '2099-07-20T03:17:42.200Z' },
      },
    ],
    parallel: { limit: '20' },
    authentication: { method: 'METHOD_ACCESS_TOKEN', scope: 'FEATURE_CODING' },
  };

  test('maps weekly + rolling windows with real percentages', () => {
    const result = applyKimiUsagePayload(baseResult(), realPayload);

    expect(result.windows).toHaveLength(2);

    const weekly = result.windows.find((w) => w.name === 'Weekly limit');
    expect(weekly.usagePercent).toBe(1);
    expect(weekly.isExhausted).toBe(false);

    const fiveHour = result.windows.find((w) => w.name === '5h limit');
    expect(fiveHour.usagePercent).toBe(6);
    expect(fiveHour.resetsAt).toBe('2099-07-20T03:17:42.200Z');
    expect(fiveHour.timeUntilResetMs).toBeGreaterThan(0);

    // Primary usage is the worst window (5h at 6%)
    expect(result.primaryUsagePercent).toBe(6);
    expect(result.primaryRemainingPercent).toBe(94);
    // Primary reset is the earliest reset
    expect(result.primaryResetAt).toBe('2099-07-20T03:17:42.200Z');
  });

  test('exposes membership metadata', () => {
    const result = applyKimiUsagePayload(baseResult(), realPayload);
    expect(result.metadata.membership).toBe('Intermediate');
    expect(result.metadata.membershipLevel).toBe('LEVEL_INTERMEDIATE');
    expect(result.metadata.region).toBe('OVERSEA');
    expect(result.metadata.parallelLimit).toBe(20);
  });

  test('computes used from remaining when used is missing', () => {
    const result = applyKimiUsagePayload(baseResult(), {
      usage: { limit: '200', remaining: '50' },
    });
    expect(result.windows[0].usagePercent).toBe(75);
    expect(result.primaryUsagePercent).toBe(75);
  });

  test('marks exhausted windows', () => {
    const result = applyKimiUsagePayload(baseResult(), {
      usage: { limit: '100', used: '100', remaining: '0' },
    });
    expect(result.windows[0].isExhausted).toBe(true);
    expect(result.primaryUsagePercent).toBe(100);
    expect(result.primaryRemainingPercent).toBe(0);
  });

  test('handles empty payload without crashing', () => {
    const result = applyKimiUsagePayload(baseResult(), {});
    expect(result.windows).toHaveLength(0);
    expect(result.error).toBeNull();
  });
});

describe('Codex wham/usage payload parsing', () => {
  test('maps 5h primary + weekly secondary windows', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const result = applyCodexUsagePayload(baseResult(), {
      plan_type: 'plus',
      rate_limit: {
        primary_window: { used_percent: 42.4, reset_at: nowSec + 3600, limit_window_seconds: 18000 },
        secondary_window: { used_percent: 10.2, reset_at: nowSec + 86400, limit_window_seconds: 604800 },
      },
    });

    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].name).toBe('5-Hour Limit');
    expect(result.windows[0].usagePercent).toBe(42.4);
    expect(result.windows[1].name).toBe('Weekly All-Model');
    expect(result.primaryUsagePercent).toBe(42.4);
    expect(result.primaryRemainingPercent).toBe(57.6);
    expect(result.metadata.planType).toBe('plus');
  });

  test('free plan single weekly window', () => {
    const result = applyCodexUsagePayload(baseResult(), {
      plan_type: 'free',
      rate_limit: {
        primary_window: { used_percent: 5, reset_at: Math.floor(Date.now() / 1000) + 1000, limit_window_seconds: 604800 },
      },
    });
    expect(result.windows[0].name).toBe('Weekly All-Model');
  });

  test('parses string credit balances', () => {
    const result = applyCodexUsagePayload(baseResult(), {
      plan_type: 'plus',
      rate_limit: {},
      credits: { balance: '12.50' },
    });
    expect(result.metadata.creditsBalance).toBe(12.5);
  });

  test('reports error when no windows present', () => {
    const result = applyCodexUsagePayload(baseResult(), { plan_type: 'plus', rate_limit: {} });
    expect(result.windows).toHaveLength(0);
    expect(result.error).toMatch(/no rate-limit windows/);
  });
});

describe('Z.ai quota payload parsing', () => {
  test('maps TIME_LIMIT and TOKENS_LIMIT', () => {
    const result = applyZaiQuotaPayload(baseResult(), {
      limits: [
        { type: 'TIME_LIMIT', currentValue: 16, remaining: 84 },
        { type: 'TOKENS_LIMIT', currentValue: 300, remaining: 700, nextResetTime: Date.now() + 7200000 },
      ],
    });

    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].name).toBe('Z.ai Time Limit');
    expect(result.windows[0].usagePercent).toBe(16);
    expect(result.windows[1].name).toBe('Z.ai Token Limit');
    expect(result.windows[1].usagePercent).toBe(30);
    expect(result.primaryUsagePercent).toBe(30);
    expect(result.timeUntilResetMs).toBeGreaterThan(0);
  });

  test('falls back to percentage field when totals are absent', () => {
    const result = applyZaiQuotaPayload(baseResult(), {
      limits: [{ type: 'TIME_LIMIT', percentage: 55 }],
    });
    expect(result.windows[0].usagePercent).toBe(55);
  });

  test('reports error when limits are empty', () => {
    const result = applyZaiQuotaPayload(baseResult(), { limits: [] });
    expect(result.error).toMatch(/no limits/);
  });
});

describe('Antigravity GetUserStatus payload parsing', () => {
  const payload = {
    userStatus: {
      email: 'user@example.com',
      planStatus: {
        planInfo: { planName: 'Pro', monthlyPromptCredits: 1000 },
        availablePromptCredits: 420,
      },
      cascadeModelConfigData: {
        clientModelConfigs: [
          {
            label: 'Claude Sonnet 4.5 (Thinking)',
            modelOrAlias: { model: 'claude-4-5-sonnet' },
            quotaInfo: { remainingFraction: 0.62, resetTime: new Date(Date.now() + 3600000).toISOString() },
          },
          {
            label: 'Gemini 3 Pro',
            modelOrAlias: { model: 'gemini-3-pro' },
            quotaInfo: { remainingFraction: 0.9, resetTime: null },
          },
          {
            label: 'GPT (no quota yet)',
            modelOrAlias: { model: 'gpt-5' },
          },
        ],
      },
    },
  };

  test('maps per-model quota, skips configs without quotaInfo', () => {
    const result = applyAntigravityStatus(baseResult(), payload);
    expect(result.isAuth).toBe(true);
    expect(result.windows).toHaveLength(2);
    expect(result.windows[0].name).toBe('Claude Sonnet 4.5');
    expect(result.windows[0].usagePercent).toBe(38);
    // Primary = worst (lowest remaining) model
    expect(result.primaryRemainingPercent).toBe(62);
    expect(result.primaryUsagePercent).toBe(38);
    expect(result.timeUntilResetMs).toBeGreaterThan(0);
    expect(result.metadata.planType).toBe('Pro');
    expect(result.metadata.promptCredits).toBe(420);
    expect(result.metadata.email).toBe('user@example.com');
  });

  test('reports error when userStatus is missing', () => {
    const result = applyAntigravityStatus(baseResult(), { message: 'unauthenticated' });
    expect(result.error).toBe('unauthenticated');
    expect(result.isAuth).toBe(false);
  });

  test('reports error when no model quotas exist', () => {
    const result = applyAntigravityStatus(baseResult(), {
      userStatus: { email: 'x@y.z', cascadeModelConfigData: { clientModelConfigs: [] } },
    });
    expect(result.error).toMatch(/no model quota data/);
  });
});
