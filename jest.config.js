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
    '<rootDir>/.plyrium-forge/',
    '<rootDir>/.plyrium-forge/worktrees/',
    '<rootDir>/.devhub/worktrees/',
    '<rootDir>/opencode/',
    '<rootDir>/sidecar-backend/',
    '<rootDir>/src-tauri/',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/.plyrium-forge/',
    '<rootDir>/.plyrium-forge/worktrees/',
    '<rootDir>/.devhub/worktrees/',
    '<rootDir>/.worktrees/',
    '<rootDir>/opencode/',
    '<rootDir>/sidecar-backend/',
    '<rootDir>/src-tauri/',
    '<rootDir>/tests/e2e/',
    '<rootDir>/devhub-mcp/',
    '/fixtures/',
  ],
  // Transform JSX/ESM files for component tests
  transform: {
    '^.+\\.(js|jsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
};
