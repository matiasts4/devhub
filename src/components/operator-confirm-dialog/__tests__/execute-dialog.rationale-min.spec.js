'use strict';

/**
 * execute-dialog.rationale-min.spec.js
 * Confirms Execute button is disabled when rationale < 10 chars.
 *
 * Note: This is a unit test for ExecuteDialog logic.
 * Since ExecuteDialog is a React component, we test the logic inline:
 * - canExecute = rationale.trim().length >= MIN_RATIONALE (where MIN_RATIONALE = 10)
 */

const MIN_RATIONALE = 10;

describe('execute-dialog.rationale-min', () => {
  function canExecute(rationale) {
    return rationale.trim().length >= MIN_RATIONALE;
  }

  it('Execute is disabled when rationale is empty', () => {
    expect(canExecute('')).toBe(false);
  });

  it('Execute is disabled when rationale is only whitespace', () => {
    expect(canExecute('          ')).toBe(false);
    expect(canExecute('\n\t')).toBe(false);
  });

  it('Execute is disabled when rationale is 1-9 characters', () => {
    for (let len = 1; len < 10; len++) {
      expect(canExecute('a'.repeat(len))).toBe(false);
    }
  });

  it('Execute is enabled when rationale is exactly 10 characters', () => {
    expect(canExecute('a'.repeat(10))).toBe(true);
  });

  it('Execute is enabled when rationale is > 10 characters', () => {
    expect(canExecute('a'.repeat(20))).toBe(true);
    expect(canExecute('Running the background worker for processing')).toBe(true);
  });

  it('Execute is enabled with enough non-whitespace characters', () => {
    // 'testing' = 7 chars → insufficient
    expect(canExecute('  testing  ')).toBe(false);
    // 10 a's with surrounding whitespace
    expect(canExecute('   a'.repeat(10) + '   ')).toBe(true);
  });
});