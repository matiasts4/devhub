const { processOscProgress } = require('../oscProgressParser.js');

describe('oscProgressParser', () => {
  test('captures OSC 4 progress payload', () => {
    const session = { _oscProgressBuffer: '' };
    processOscProgress(session, '\x1b]4;0\x07');
    expect(session.oscProgress).toBe('0');
  });
});
