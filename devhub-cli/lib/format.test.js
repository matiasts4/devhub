'use strict';

const path = require('path');
const FORMAT_PATH = path.resolve(__dirname, 'format.js');

describe('lib/format.js helpers', () => {
  describe('section()', () => {
    it('is exported as a function', () => {
      jest.resetModules();
      process.stdout.isTTY = undefined;
      const fmt = require(FORMAT_PATH);
      expect(typeof fmt.section).toBe('function');
    });

    it('returns plain header when not TTY', () => {
      jest.resetModules();
      process.stdout.isTTY = undefined;
      const fmt = require(FORMAT_PATH);
      const result = fmt.section('Projects');
      expect(result).toContain('Projects');
      expect(result).not.toContain('\x1b[');
    });

    it('returns colored header when TTY', () => {
      jest.resetModules();
      process.stdout.isTTY = true;
      try {
        const fmt = require(FORMAT_PATH);
        const result = fmt.section('Projects');
        expect(result).toContain('Projects');
        expect(result).toContain('\x1b[');
      } finally {
        process.stdout.isTTY = undefined;
      }
    });
  });

  describe('row()', () => {
    it('is exported as a function', () => {
      jest.resetModules();
      const fmt = require(FORMAT_PATH);
      expect(typeof fmt.row).toBe('function');
    });

    it('returns indented label: value string', () => {
      jest.resetModules();
      const fmt = require(FORMAT_PATH);
      const result = fmt.row('Name', 'MyProject');
      expect(result).toBe('  Name: MyProject');
    });
  });

  describe('divider()', () => {
    it('is exported as a function', () => {
      jest.resetModules();
      process.stdout.isTTY = undefined;
      const fmt = require(FORMAT_PATH);
      expect(typeof fmt.divider).toBe('function');
    });

    it('returns 40-char plain dashes when not TTY', () => {
      jest.resetModules();
      process.stdout.isTTY = undefined;
      const fmt = require(FORMAT_PATH);
      const result = fmt.divider();
      expect(result).toBe('-'.repeat(40));
      expect(result).not.toContain('\x1b[');
    });

    it('returns colored line when TTY', () => {
      jest.resetModules();
      process.stdout.isTTY = true;
      try {
        const fmt = require(FORMAT_PATH);
        const result = fmt.divider();
        expect(result.length).toBeGreaterThan(40); // includes ANSI codes
        expect(result).toContain('\x1b[');
      } finally {
        process.stdout.isTTY = undefined;
      }
    });
  });
});
