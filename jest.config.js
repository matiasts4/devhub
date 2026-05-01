/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/jest.runtime-compat.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^node:test$': '<rootDir>/tests/shims/node-test.js',
  },
  modulePathIgnorePatterns: [
    '<rootDir>/.next/',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/opencode/',
    '<rootDir>/sidecar-backend/',
    '<rootDir>/src-tauri/',
    '<rootDir>/tests/e2e/',
    '<rootDir>/devhub-mcp/',
  ],
  // Transform JSX/ESM files for component tests
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
};
