/**
 * Tests for the Spanish error formatter used by `useZedChat` (ZCX-001).
 *
 * The formatter is the only thing between raw tool errors and the user;
 * its job is to translate known error codes into friendly Spanish
 * messages and to keep the response free of "Error:" prefixes and stack
 * traces.
 */

const { formatZedToolError, formatToolErrorForUser } = require('../../zedChat/errors');

describe('zedChat errors.formatZedToolError — ZCX-001', () => {
  test('not_found with three active names lists all three', () => {
    const result = formatZedToolError('open_terminal', {
      code: 'not_found',
      activeNames: ['Chase', 'Nate', 'Cesar'],
    });
    expect(result.kind).toBe('not_found');
    expect(result.message).toContain('Chase');
    expect(result.message).toContain('Nate');
    expect(result.message).toContain('Cesar');
    expect(result.message).not.toMatch(/^Error:/);
  });

  test('not_found with 8 active names lists the first 5 + "y N más"', () => {
    const result = formatZedToolError('execute_in_terminal', {
      code: 'not_found',
      activeNames: ['Alex', 'Avery', 'Blake', 'Cameron', 'Casey', 'Cesar', 'Chase', 'Dakota'],
    });
    expect(result.kind).toBe('not_found');
    // First 5 names are present.
    expect(result.message).toContain('Alex');
    expect(result.message).toContain('Avery');
    expect(result.message).toContain('Blake');
    expect(result.message).toContain('Cameron');
    expect(result.message).toContain('Casey');
    // Truncation marker.
    expect(result.message).toContain('y 3 más');
    // The 6th, 7th, 8th entries should not appear by name in the message.
    expect(result.message).not.toContain('Cesar');
    expect(result.message).not.toContain('Chase');
    expect(result.message).not.toContain('Dakota');
  });

  test('ambiguous lists each candidate as "Name (terminalId)"', () => {
    const result = formatZedToolError('open_terminal', {
      code: 'ambiguous',
      candidates: [
        { terminalId: 'p1', displayName: 'Chase' },
        { terminalId: 'p2', displayName: 'Chase' },
      ],
    });
    expect(result.kind).toBe('ambiguous');
    expect(result.message).toContain('Chase (p1)');
    expect(result.message).toContain('Chase (p2)');
    expect(result.message).toContain('¿a cuál te referís?');
  });

  test('too_long returns the exact Spanish string', () => {
    const result = formatZedToolError('execute_in_terminal', { code: 'too_long' });
    expect(result.kind).toBe('too_long');
    expect(result.message).toBe(
      'el script es demasiado largo (máximo 64 líneas × 256 caracteres).'
    );
  });

  test('multiline_blocked with lineCount: 65 includes the count in the message', () => {
    const result = formatZedToolError('execute_in_terminal', {
      code: 'multiline_blocked',
      lineCount: 65,
    });
    expect(result.kind).toBe('multiline_blocked');
    expect(result.message).toContain('65');
    expect(result.message).toContain('64');
  });

  test('both_name_and_session returns the exact Spanish string', () => {
    const result = formatZedToolError('execute_in_terminal', { code: 'both_name_and_session' });
    expect(result.kind).toBe('both_name_and_session');
    expect(result.message).toBe('no podés pasar name y session_id a la vez.');
  });

  test('generic with a regular Error uses the error message (lowercased first letter)', () => {
    const result = formatZedToolError('open_terminal', new Error('Boom'));
    expect(result.kind).toBe('generic');
    // Either lowercased first letter or exact pass-through — keep user-friendly.
    expect(result.message.toLowerCase()).toContain('boom');
    expect(result.message).not.toMatch(/^Error:/);
  });

  test('unknown tool name falls back to generic', () => {
    const result = formatZedToolError('mystery_tool', { code: 'not_found' });
    expect(result.kind).toBe('generic');
  });

  test('null error returns generic with "error desconocido"', () => {
    const result = formatZedToolError('open_terminal', null);
    expect(result.kind).toBe('generic');
    expect(result.message.toLowerCase()).toContain('error desconocido');
  });

  test('undefined error returns generic with "error desconocido"', () => {
    const result = formatZedToolError('open_terminal', undefined);
    expect(result.kind).toBe('generic');
    expect(result.message.toLowerCase()).toContain('error desconocido');
  });

  test('details object is preserved on the result', () => {
    const result = formatZedToolError('execute_in_terminal', {
      code: 'not_found',
      activeNames: ['Chase'],
    });
    expect(result.details).toBeDefined();
  });

  test('result never includes an "Error:" prefix or a stack trace fragment', () => {
    const cases = [
      { code: 'not_found', activeNames: ['Chase'] },
      { code: 'ambiguous', candidates: [{ terminalId: 'p1', displayName: 'X' }] },
      { code: 'too_long' },
      { code: 'multiline_blocked', lineCount: 99 },
      { code: 'both_name_and_session' },
      new Error('Boom at file.js:42'),
    ];
    for (const err of cases) {
      const out = formatZedToolError('open_terminal', err);
      expect(out.message).not.toMatch(/^Error:/);
      expect(out.message).not.toMatch(/\.js:\d+/); // no raw stack frames
    }
  });

  test('formatToolErrorForUser is an alias for formatZedToolError', () => {
    const a = formatZedToolError('open_terminal', { code: 'not_found', activeNames: [] });
    const b = formatToolErrorForUser('open_terminal', { code: 'not_found', activeNames: [] });
    expect(a).toEqual(b);
  });
});
