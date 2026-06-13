/* eslint-disable no-undef */
/**
 * Jest configuration for component tests.
 * Uses jsdom environment for DOM testing with React Testing Library.
 *
 * The eslint config in this repo only adds `jest.config.js` to its
 * commonJsAndJestFiles glob; this sibling file (`jest.config.component.js`)
 * is matched by the browser config which doesn't know about `require` /
 * `module`. Silence no-undef at the file level; jest's own runtime
 * is the source of truth for the global surface here.
 */

const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  testEnvironment: 'jsdom',
  setupFiles: [], // Clear parent setupFiles to avoid runtime-compat issues
  setupFilesAfterEnv: ['<rootDir>/jest.setup.component.js'],
  testMatch: ['**/__tests__/**/*.component.test.[jt]s?(x)', '**/?(*.)component.test.[jt]s?(x)'],
};
