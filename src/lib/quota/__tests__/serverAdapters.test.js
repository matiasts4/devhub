import { applyKimiUsagePayload } from '../server/kimi.js';
import { applyCodexUsagePayload } from '../server/codex.js';
import { applyZaiQuotaPayload } from '../server/zai.js';
import { applyAntigravityStatus } from '../server/antigravity.js';
import { applyQoderQuotaPayload } from '../server/qoder.js';

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
        primary_window: {
          used_percent: 42.4,
          reset_at: nowSec + 3600,
          limit_window_seconds: 18000,
        },
        secondary_window: {
          used_percent: 10.2,
          reset_at: nowSec + 86400,
          limit_window_seconds: 604800,
        },
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
        primary_window: {
          used_percent: 5,
          reset_at: Math.floor(Date.now() / 1000) + 1000,
          limit_window_seconds: 604800,
        },
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
        {
          type: 'TOKENS_LIMIT',
          currentValue: 300,
          remaining: 700,
          nextResetTime: Date.now() + 7200000,
        },
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
            quotaInfo: {
              remainingFraction: 0.62,
              resetTime: new Date(Date.now() + 3600000).toISOString(),
            },
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

describe('Qoder credits payload parsing', () => {
  const payload = {
    userId: 'u1',
    userType: 'personal_professional',
    usageType: 'credits',
    totalUsagePercentage: 0.25,
    isQuotaExceeded: false,
    expiresAt: 1787673600000,
    upgradeUrl: 'https://qoder.com/pricing?client=qoder',
    userQuota: { total: 2000, used: 259, remaining: 1741, percentage: 0.13, unit: 'credits' },
    addOnQuota: {
      total: 300,
      used: 300,
      remaining: 0,
      percentage: 1,
      unit: 'credits',
      detailUrl: 'https://qoder.com/account/usage',
    },
    isPlanQuotaProrated: false,
  };

  test('maps plan + add-on credit windows with combined primary usage', () => {
    const result = applyQoderQuotaPayload(baseResult(), payload, 1785000000000);

    expect(result.windows).toHaveLength(2);

    const plan = result.windows.find((w) => w.name === 'Plan credits');
    // used/total drives the window, not the 0..1 fraction: 259/2000 ≈ 12.95%
    expect(plan.usagePercent).toBe(13);
    expect(plan.isExhausted).toBe(false);
    expect(plan.resetsAt).toBe(new Date(1787673600000).toISOString());

    const addOn = result.windows.find((w) => w.name === 'Add-on credits');
    expect(addOn.usagePercent).toBe(100);
    expect(addOn.isExhausted).toBe(true);
    expect(addOn.resetsAt).toBeNull();

    // Primary = combined totalUsagePercentage (0.25 fraction → 25%)
    expect(result.primaryUsagePercent).toBe(25);
    expect(result.primaryRemainingPercent).toBe(75);
    expect(result.timeUntilResetMs).toBeGreaterThan(0);
  });

  test('exposes credit + plan metadata', () => {
    const result = applyQoderQuotaPayload(baseResult(), payload, 1785000000000);
    expect(result.metadata.userType).toBe('personal_professional');
    expect(result.metadata.usageType).toBe('credits');
    expect(result.metadata.unit).toBe('credits');
    expect(result.metadata.planCredits).toEqual({ total: 2000, used: 259, remaining: 1741 });
    expect(result.metadata.addOnCredits).toEqual({
      total: 300,
      used: 300,
      remaining: 0,
      detailUrl: 'https://qoder.com/account/usage',
    });
    expect(result.metadata.dataSource).toBe('cli-log');
    expect(result.metadata.dataAsOfMs).toBe(1785000000000);
    expect(result.metadata.upgradeUrl).toBe('https://qoder.com/pricing?client=qoder');
    expect(result.metadata.planExpiresAt).toBe(new Date(1787673600000).toISOString());
    expect(Number.isInteger(result.metadata.daysUntilRenewal)).toBe(true);
    expect(result.metadata.daysUntilRenewal).toBeGreaterThan(0);
  });

  test('plan-only payload yields a single window', () => {
    const result = applyQoderQuotaPayload(baseResult(), {
      userType: 'personal_standard',
      usageType: 'credits',
      totalUsagePercentage: 0.5,
      userQuota: { total: 100, used: 50, remaining: 50, percentage: 0.5, unit: 'credits' },
    });
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0].name).toBe('Plan credits');
    expect(result.windows[0].usagePercent).toBe(50);
    expect(result.primaryUsagePercent).toBe(50);
    expect(result.metadata.addOnCredits).toBeNull();
  });

  test('treats the year-9999 sentinel as no reset', () => {
    const result = applyQoderQuotaPayload(baseResult(), {
      usageType: 'credits',
      isQuotaExceeded: true,
      expiresAt: 253402214400000,
      userQuota: { total: 0, used: 0, remaining: 0, percentage: 0, unit: 'credits' },
    });
    expect(result.primaryResetAt).toBeNull();
    expect(result.timeUntilResetMs).toBeNull();
    expect(result.metadata.daysUntilRenewal).toBeNull();
    expect(result.metadata.isQuotaExceeded).toBe(true);
  });

  test('reports error when no quota data present', () => {
    const result = applyQoderQuotaPayload(baseResult(), { usageType: 'credits' });
    expect(result.windows).toHaveLength(0);
    expect(result.error).toMatch(/no quota data/);
  });
});
