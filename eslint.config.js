import js from '@eslint/js';
import globals from 'globals';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';

const browserAppFiles = ['src/**/*.{js,jsx,ts,tsx}'];
const browserAppIgnores = [
  'src/app/api/**',
  'src/lib/db/**/*.js',
  'src/lib/sdd/**/*.js',
  'src/lib/terminal/**/*.js',
  'src/lib/operator/**/*.js',
  'src/test-support/**/*.js',
  'src/**/*.test.js',
  'src/**/*.spec.js',
  'src/**/__tests__/**',
];

const nodeEsmFiles = [
  'src/app/api/**/*.js',
  'src/lib/terminal/**/*.js',
  'src/lib/operator/**/*.js',
];

const swarmCommonJsFiles = [
  'src/lib/swarm/agentWorkspaceManager.js',
  'src/lib/swarm/cleanup.js',
  'src/lib/swarm/integrationWorktree.js',
  'src/lib/swarm/missionClose.js',
  'src/lib/swarm/opencodeDeliveryAdapter.js',
  'src/lib/swarm/opencodeTargetResolver.js',
  'src/lib/swarm/processManager.js',
  'src/lib/swarm/reconciliation.js',
  'src/lib/swarm/supervisorDaemon.js',
  'src/lib/swarm/supervisorLoop.js',
  'src/lib/swarm/teamTell.js',
];

const commonJsAndJestFiles = [
  'bin/**/*.js',
  'devhub-cli/**/*.js',
  'jest.config.js',
  'lib/**/*.js',
  'scripts/**/*.cjs',
  'tests/**/*.js',
  'src/lib/db/**/*.js',
  'src/lib/sdd/**/*.js',
  ...swarmCommonJsFiles,
  'src/lib/gitCheckpointHandoff.js',
  'src/lib/directorGeneral/**/*.js',
  'src/test-support/**/*.js',
  'src/**/*.test.js',
  'src/**/*.spec.js',
  'src/**/__tests__/**/*.js',
];

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Base recommended rules
  js.configs.recommended,

  // React files (JSX/TSX)
  {
    files: browserAppFiles,
    ignores: browserAppIgnores,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
        process: 'readonly',
        React: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks,
    },
    rules: {
      // QA-06: Reglas de calidad estrictas
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-debugger': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',

      // React rules
      'react/no-unknown-property': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Allow JSX without explicit React import (React 17+)
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },

  // Node ESM files inside src/
  {
    files: nodeEsmFiles,
    ignores: ['src/**/*.test.js', 'src/**/*.spec.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
  },

  // CommonJS + Jest runtime files
  {
    files: commonJsAndJestFiles,
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser,
        ...globals.es2020,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Ignore generated/config files
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.devhub/**',
      'out/**',
      'devhub-mcp/node_modules/**',
      'devhub-mcp/**',
      'sidecar-backend/**',
      'telegram-bot/**',
      'src-tauri/**',
      '*.config.js',
      'craco.config.js',
      'tailwind.config.js',
      'postcss.config.js',
    ],
  },
];
