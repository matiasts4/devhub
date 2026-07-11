const { getRegion } = require('../ruleEngine.js');

describe('ruleEngine getRegion', () => {
  describe('codex prompt marker regions', () => {
    const screen = [
      '• some earlier block',
      '■ another block',
      'context line',
      '› current prompt',
      'user typing here',
    ].join('\n');

    test('before_current_prompt_marker returns content before the prompt', () => {
      const region = getRegion({ screen }, 'before_current_prompt_marker');
      expect(region).toContain('context line');
      expect(region).not.toContain('› current prompt');
      expect(region).not.toContain('user typing here');
    });

    test('whole_recent_without_current_prompt_marker returns empty when prompt exists', () => {
      expect(getRegion({ screen }, 'whole_recent_without_current_prompt_marker')).toBe('');
    });

    test('whole_recent_without_current_prompt_marker returns content when no prompt', () => {
      const noPrompt = 'line one\nline two';
      expect(getRegion({ screen: noPrompt }, 'whole_recent_without_current_prompt_marker')).toBe(
        noPrompt
      );
    });

    test('current_prompt_block_marker returns the nearest block marker above the prompt', () => {
      expect(getRegion({ screen }, 'current_prompt_block_marker')).toBe('■ another block');
    });

    test('after_current_prompt_block_marker returns content from the block marker down', () => {
      const region = getRegion({ screen }, 'after_current_prompt_block_marker');
      expect(region).toContain('■ another block');
      expect(region).toContain('› current prompt');
    });
  });

  describe('prompt box regions', () => {
    const screen = ['header', '──────', 'prompt line', '──────', 'footer'].join('\n');

    test('above_prompt_box returns content before the prompt box', () => {
      const region = getRegion({ screen }, 'above_prompt_box');
      expect(region).toBe('header\n');
    });

    test('last_non_empty_above_prompt_box returns the last non-empty line above the box', () => {
      expect(getRegion({ screen }, 'last_non_empty_above_prompt_box')).toBe('header');
    });

    test('prompt_box_body returns the body between horizontal rules', () => {
      expect(getRegion({ screen }, 'prompt_box_body')).toBe('prompt line\n');
    });
  });
});
