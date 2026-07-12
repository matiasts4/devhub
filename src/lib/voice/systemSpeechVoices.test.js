/**
 * @jest-environment node
 */

'use strict';

const {
  listSystemSpeechVoices,
  rankSystemVoices,
  findSystemVoice,
  pickBestSpanishVoice,
  resolveSpeechSynthesisVoice,
} = require('./systemSpeechVoices.js');

const SAMPLE = [
  { voiceURI: 'en-US-Zira', name: 'Microsoft Zira', lang: 'en-US', localService: true },
  { voiceURI: 'es-MX-Raul', name: 'Microsoft Raul', lang: 'es-MX', localService: true },
  {
    voiceURI: 'es-MX-Sabina-Natural',
    name: 'Microsoft Sabina Online (Natural) - Spanish (Mexico)',
    lang: 'es-MX',
    localService: false,
  },
  { voiceURI: 'es-ES-Helena', name: 'Microsoft Helena', lang: 'es-ES', localService: true },
];

describe('systemSpeechVoices', () => {
  test('listSystemSpeechVoices maps synth voices', () => {
    const synth = { getVoices: () => SAMPLE };
    const listed = listSystemSpeechVoices(synth);
    expect(listed).toHaveLength(4);
    expect(listed[0]).toMatchObject({ voiceURI: 'en-US-Zira', lang: 'en-US' });
  });

  test('rankSystemVoices prefers Spanish Natural/Neural first', () => {
    const ranked = rankSystemVoices(SAMPLE);
    expect(ranked[0].voiceURI).toBe('es-MX-Sabina-Natural');
    expect(ranked.map((v) => v.lang.startsWith('es'))).toEqual([true, true, true, false]);
  });

  test('findSystemVoice matches by voiceURI or name', () => {
    expect(findSystemVoice(SAMPLE, 'es-MX-Raul')?.name).toBe('Microsoft Raul');
    expect(findSystemVoice(SAMPLE, 'Microsoft Helena')?.voiceURI).toBe('es-ES-Helena');
    expect(findSystemVoice(SAMPLE, '')).toBeNull();
  });

  test('pickBestSpanishVoice returns top-ranked Spanish voice', () => {
    expect(pickBestSpanishVoice(SAMPLE)?.voiceURI).toBe('es-MX-Sabina-Natural');
  });

  test('resolveSpeechSynthesisVoice uses saved URI when present', () => {
    const synth = { getVoices: () => SAMPLE };
    const voice = resolveSpeechSynthesisVoice(synth, { systemVoiceURI: 'es-MX-Raul' });
    expect(voice.name).toBe('Microsoft Raul');
  });

  test('resolveSpeechSynthesisVoice falls back to best Spanish', () => {
    const synth = { getVoices: () => SAMPLE };
    const voice = resolveSpeechSynthesisVoice(synth, { systemVoiceURI: '' });
    expect(voice.voiceURI).toBe('es-MX-Sabina-Natural');
  });
});
