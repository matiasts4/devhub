const { resolveBootstrapPromptForLaunch } = require('../swarmControl.js');

describe('resolveBootstrapPromptForLaunch', () => {
  test('standby mode skips SDD worker bootstrap but keeps ZED prompt', () => {
    expect(
      resolveBootstrapPromptForLaunch({
        roleKey: 'sdd_worker_1',
        prompt: 'worker instructions',
        bootstrapMode: 'standby',
      })
    ).toBe('');
    expect(
      resolveBootstrapPromptForLaunch({
        roleKey: 'zed',
        prompt: 'zed instructions',
        bootstrapMode: 'standby',
      })
    ).toBe('zed instructions');
  });

  test('engram_first keeps worker bootstrap prompt', () => {
    expect(
      resolveBootstrapPromptForLaunch({
        roleKey: 'sdd_worker_2',
        prompt: 'worker instructions',
        bootstrapMode: 'engram_first',
      })
    ).toBe('worker instructions');
  });
});
