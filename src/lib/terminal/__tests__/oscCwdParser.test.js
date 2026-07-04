/**
 * oscCwdParser.test.js — TDD unit tests for OSC 7 cwd parser.
 *
 * Verifies: single-chunk parsing, multi-chunk streaming, BEL vs ST terminators,
 * file://hostname/path and bare path forms, malformed sequences, multiple OSC 7
 * in one chunk, and non-OSC-7 passthrough.
 */

const { parseOscCwd, createOscCwdParser } = require('../oscCwdParser.js');

describe('oscCwdParser — parseOscCwd one-shot', () => {
  it('parses OSC 7 with ST terminator and file:// form', () => {
    const chunk = '\x1b]7;file://myhost/home/user\x1b\\after';
    const result = parseOscCwd(chunk);
    expect(result.cwd).toBe('/home/user');
    expect(result.consumed).toBe(29); // length of OSC 7 sequence
  });

  it('parses OSC 7 with BEL terminator and file:// form', () => {
    const chunk = '\x1b]7;file://myhost/home/user\x07after';
    const result = parseOscCwd(chunk);
    expect(result.cwd).toBe('/home/user');
    expect(result.consumed).toBe(28);
  });

  it('parses bare path form', () => {
    const chunk = '\x1b]7;/tmp/project\x1b\\';
    const result = parseOscCwd(chunk);
    expect(result.cwd).toBe('/tmp/project');
    expect(result.consumed).toBe(18);
  });

  it('returns null cwd when no OSC 7 sequence is present', () => {
    const chunk = 'hello world';
    const result = parseOscCwd(chunk);
    expect(result.cwd).toBeNull();
    expect(result.consumed).toBe(0);
  });

  it('returns null cwd for malformed OSC 7 without terminator', () => {
    const chunk = '\x1b]7;/no/terminator';
    const result = parseOscCwd(chunk);
    expect(result.cwd).toBeNull();
    expect(result.consumed).toBe(0);
  });

  it('returns the last cwd when multiple OSC 7 sequences appear', () => {
    const chunk = '\x1b]7;file://myhost/home/user\x1b\\\x1b]7;file://myhost/home/user/project\x07';
    const result = parseOscCwd(chunk);
    expect(result.cwd).toBe('/home/user/project');
    expect(result.consumed).toBe(65);
  });

  it('URL-decodes the path from file:// form', () => {
    const chunk = '\x1b]7;file://myhost/home/user/my%20dir\x1b\\';
    const result = parseOscCwd(chunk);
    expect(result.cwd).toBe('/home/user/my dir');
  });

  it('normalizes Windows file:// paths', () => {
    const chunk = '\x1b]7;file://myhost/C:/Users/Tester\x07';
    const result = parseOscCwd(chunk);
    expect(result.cwd).toBe('C:/Users/Tester');
  });
});

describe('oscCwdParser — streaming createOscCwdParser', () => {
  it('extracts cwd when OSC 7 is split across chunks with ST terminator', () => {
    const parser = createOscCwdParser();
    const part1 = parser.parse('\x1b]7;file://myhost/home/u');
    expect(part1.cwd).toBeNull();
    expect(part1.consumed).toBe(0);

    const part2 = parser.parse('ser\x1b\\');
    expect(part2.cwd).toBe('/home/user');
    expect(part2.consumed).toBe(29); // full OSC 7 sequence length
  });

  it('extracts cwd when OSC 7 is split across chunks with BEL terminator', () => {
    const parser = createOscCwdParser();
    parser.parse('\x1b]7;file://myhost/home/u');
    const result = parser.parse('ser\x07');
    expect(result.cwd).toBe('/home/user');
  });

  it('parses multiple complete sequences across chunks', () => {
    const parser = createOscCwdParser();
    const r1 = parser.parse('\x1b]7;/first\x1b\\text\x1b]7;/se');
    expect(r1.cwd).toBe('/first');
    expect(r1.consumed).toBe(12);

    const r2 = parser.parse('cond\x07trailing');
    expect(r2.cwd).toBe('/second');
    expect(r2.consumed).toBe(12);
  });

  it('flushes incomplete sequence without terminator as null', () => {
    const parser = createOscCwdParser();
    parser.parse('\x1b]7;/incomplete');
    const flushed = parser.flush();
    expect(flushed.cwd).toBeNull();
  });

  it('returns cwd on parse for complete sequence at end; flush then has nothing', () => {
    const parser = createOscCwdParser();
    const parsed = parser.parse('prefix\x1b]7;/done\x07');
    expect(parsed.cwd).toBe('/done');
    const flushed = parser.flush();
    expect(flushed.cwd).toBeNull();
  });

  it('keeps trailing non-OSC bytes across chunks', () => {
    const parser = createOscCwdParser();
    const r1 = parser.parse('hello \x1b]7;/path\x1b\\world');
    expect(r1.cwd).toBe('/path');
    expect(r1.consumed).toBe(11); // OSC 7 sequence length

    const r2 = parser.parse(' more');
    expect(r2.cwd).toBeNull();
    expect(r2.consumed).toBe(0);
  });
});
