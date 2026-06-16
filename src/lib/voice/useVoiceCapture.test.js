const {
  INFO_VOICE_STATUSES,
  normalizeVoicePhase,
  shouldEnterPreparingPhase,
} = require('./useVoiceCapture.js');

describe('normalizeVoicePhase', () => {
  it('stays ready when TTS setup emits using-dev-voice-venv', () => {
    expect(normalizeVoicePhase('using-dev-voice-venv', false, 'ready')).toBe('ready');
    expect(INFO_VOICE_STATUSES.has('using-dev-voice-venv')).toBe(true);
  });

  it('allows engine-starting to enter preparing from ready', () => {
    expect(shouldEnterPreparingPhase('ready', 'engine-starting')).toBe(true);
    expect(normalizeVoicePhase('engine-starting', false, 'ready')).toBe('preparing');
  });

  it('blocks mic prep downgrade for dev venv ping after ready', () => {
    expect(shouldEnterPreparingPhase('ready', 'using-dev-voice-venv')).toBe(false);
  });
});
