import js from '@eslint/js';
import globals from 'globals';
import pluginReact from 'eslint-plugin-react';
import pluginReactHooks from 'eslint-plugin-react-hooks';

const browserAppFiles = ['src/**/*.{js,jsx,ts,tsx}'];
const browserAppIgnores = [
  'src/app/api/**',
  'src/lib/db/**/*.js',
  'src/lib/terminal/**/*.js',
  'src/lib/constants/local.js',
  'src/test-support/**/*.js',
  'src/**/*.test.js',
  'src/**/*.spec.js',
  'src/**/__tests__/**',
];

const nodeEsmFiles = [
  'src/app/api/**/*.js',
  'src/lib/terminal/**/*.js',
  'src/lib/swarm/openCodeProcesses.js',
];

const swarmCommonJsFiles = [
  'src/lib/swarm/agentWorkspaceManager.js',
  'src/lib/swarm/cleanup.js',
  'src/lib/swarm/integrationWorktree.js',
  'src/lib/swarm/missionClose.js',
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
  'desktop/electron/**/*.{js,cjs}',
  'jest.config.js',
  'lib/**/*.js',
  'scripts/**/*.cjs',
  'tests/**/*.js',
  'src/lib/db/**/*.js',
  'src/lib/constants/local.js',
  ...swarmCommonJsFiles,
  'src/lib/gitCheckpointHandoff.js',
  'src/lib/devhub/**/*.js',
  'src/lib/auth/providers/*.js',
  'src/test-support/**/*.js',
  'src/**/*.test.js',
  'src/**/*.spec.js',
  'src/**/__tests__/**/*.js',
  'skills/**/__tests__/**/*.js',
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
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-debugger': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',

      // React rules
      'react/no-unknown-property': 'error',
      'react/jsx-uses-vars': 'error',
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
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
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
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // PR4 (task 4.8): pg is restricted to src/lib/db/postgres-generic.js only (enforced by no-supabase-import.test.js + driver-selector).
      // Full no-restricted-imports rule for pg (and resend) was added in PR1 for supabase; extended here via test guard.
    },
  },

  // Pizarra lib tests use ESM imports under Jest/Babel
  {
    files: ['src/lib/pizarra/**/__tests__/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2020,
      },
    },
  },

  // Terminal/swarm lib tests use ESM imports under Jest/Babel
  {
    files: [
      'src/lib/terminal/**/*.test.js',
      'src/lib/swarm/**/*.test.js',
      'tests/unit/swarm-role-meta.test.js',
      'tests/unit/swarm-launch-command.test.js',
      'tests/unit/swarm-route-launch-command.test.js',
    ],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2020,
      },
    },
  },

  // Lib and App __tests__ and selected unit tests use ESM imports under Jest/Babel
  {
    files: [
      'src/lib/**/__tests__/**/*.js',
      'src/app/**/__tests__/**/*.js',
      'tests/unit/panel-helpers.test.js',
    ],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2020,
      },
    },
  },

  // Override for localClient.js and its test to support ESM
  {
    files: ['src/lib/db/localClient.js', 'src/lib/db/__tests__/localClient.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.es2020,
        process: 'readonly',
      },
    },
  },

  // projectClassification uses ESM syntax in its unit test
  {
    files: ['src/lib/projectClassification.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
  },

  // Additional CommonJS sources under src/ (module.exports / require based)
  {
    files: [
      'src/lib/auth/errors.js',
      'src/lib/auth/provider.js',
      'src/lib/bus/shim/tct.js',
      'src/lib/directorGeneral/bridge.js',
      'src/lib/directorGeneral/index.js',
      'src/lib/directorGeneral/timeline.js',
      'src/lib/operations/action-registry.js',
      'src/lib/operations/adapter-boundary.js',
      'src/lib/operations/audit-emitter.js',
      'src/lib/operations/intent-router.js',
      'src/lib/operations/policy-layer.js',
      'src/lib/operators/timelineRedaction.js',
      'src/lib/operators/timelineRetention.js',
      'src/lib/operators/timelineStore.js',
      'src/lib/operators/timelineTypes.js',
      'src/lib/pizarra/stateHelpers.js',
      'src/lib/runtime/isDevelopmentRuntime.js',
      'src/lib/sdd/ContextManager.js',
      'src/lib/sdd/ModelConsolidator.js',
      'src/lib/sdd/SessionPersistence.js',
      'src/lib/sdd/WorktreeSyncer.js',
      'src/lib/sdd/engramSync.js',
      'src/lib/sdd/sessionIdUtils.js',
      'src/lib/suggestions/cache.js',
      'src/lib/suggestions/rules.js',
      'src/lib/tenancy/policy.js',
      'src/lib/tenancy/with-workspace-context.js',
      'src/lib/ui-tokens.js',
      'src/components/workspace/browserHistory.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Jest tests (ESM under Jest/Babel; JSX allowed)
  {
    files: ['src/**/*.test.{js,jsx,ts,tsx}', 'src/**/__tests__/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        ...globals.es2020,
        React: 'readonly',
        process: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'react/jsx-uses-vars': 'error',
    },
    plugins: {
      react: pluginReact,
    },
  },

  // Jest manual mocks (CommonJS or ESM, JSX allowed)
  {
    files: ['src/**/__mocks__/**'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.browser,
        ...globals.es2020,
        React: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
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
      'src-tauri/**',
      '*.config.js',
      'craco.config.js',
      'tailwind.config.js',
      'postcss.config.js',
    ],
  },
];
