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
  'src/lib/directorGeneral/useDirectorGeneralBridge.js',
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
  'src/lib/auth/**/*.js',
  'src/lib/bus/**/*.js',
  'src/lib/db/**/*.js',
  'src/lib/sdd/**/*.js',
  'src/lib/tenancy/**/*.js',
  ...swarmCommonJsFiles,
  'src/lib/gitCheckpointHandoff.js',
  'src/lib/directorGeneral/polling.js',
  'src/lib/directorGeneral/timeline.js',
  'src/lib/directorGeneral/bridge.js',
  'src/test-support/**/*.js',
  'src/**/*.test.js',
  'src/**/*.spec.js',
  'src/**/__tests__/**/*.js',
];

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Base recommended rules
  js.configs.recommended,

  // Cloud-foundation (devhub-cloud-foundation): adapter isolation.
  // Vendor SDKs may only be imported from their respective adapter file.
  // CI fails on violation (REQ-AUTH-2, REQ-PGD-2, REQ-EMAIL-4).
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    ignores: [
      'src/lib/auth/providers/supabase.js',
      'src/lib/auth/providers/supabase.ts',
      'src/lib/auth/providers/supabase.jsx',
      'src/lib/auth/providers/supabase.tsx',
      'src/lib/db/postgres-generic.js',
      'src/lib/db/postgres-generic.ts',
      'src/lib/email/providers/resend.js',
      'src/lib/email/providers/resend.ts',
      'src/lib/email/providers/resend.jsx',
      'src/lib/email/providers/resend.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              message:
                '@supabase/supabase-js may only be imported from src/lib/auth/providers/supabase.{js,ts} (REQ-AUTH-2)',
            },
            {
              name: '@supabase/ssr',
              message:
                '@supabase/ssr may only be imported from src/lib/auth/providers/supabase.{js,ts} (REQ-AUTH-2)',
            },
            {
              name: 'pg',
              message:
                'pg may only be imported from src/lib/db/postgres-generic.{js,ts} (REQ-PGD-2)',
            },
            {
              name: 'resend',
              message:
                'resend may only be imported from src/lib/email/providers/resend.{js,ts} (REQ-EMAIL-4)',
            },
          ],
        },
      ],
    },
  },

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
