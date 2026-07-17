/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/tests/jest.runtime-compat.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^node:test$': '<rootDir>/tests/shims/node-test.js',
    '\\.module\\.css$': '<rootDir>/tests/jest.mocks/css-module.js',
    // react-router-dom v7 ships a broken `main` field (dist/main.js missing)
    // and uses `react-router/dom` subpath exports that Jest 27 cannot resolve.
    // Force Jest to the real CJS entries so component/routing tests can import them.
    '^react-router-dom$': '<rootDir>/node_modules/react-router-dom/dist/index.js',
    '^react-router/dom$': '<rootDir>/node_modules/react-router/dist/development/dom-export.js',
    '^@xterm/addon-webgl$': '<rootDir>/src/__mocks__/xterm-addon-webgl.js',
    '^@xterm/addon-canvas$': '<rootDir>/src/__mocks__/xterm-addon-canvas.js',
  },
  modulePathIgnorePatterns: [
    '<rootDir>/.tmp/',
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
    '<rootDir>/.tmp/',
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
