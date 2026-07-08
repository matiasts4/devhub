#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const ROOT_LOG_GLOBS = [
  'tmp_tauri_build_latest.log',
  'tmp_build.log',
  'tmp_coverage.log',
  'tmp_full_test.log',
  'tmp_lint_changed.log',
  'tmp_lint_motion.log',
  'tmp_motion_lab_test.log',
  'tmp_targeted_motion_tests.log',
  'tmp_verify_build.log',
  'tmp_verify_motion_tests.log',
  'ttysnap.log',
  'network.log',
  'output.txt',
  'lint_errors.txt',
];

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dirSizeBytes(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return stat.size;

  let total = 0;
  const stack = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        total += fs.statSync(fullPath).size;
      } catch (_error) {
        // ignore races
      }
    }
  }
  return total;
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const bytes = dirSizeBytes(targetPath);
  fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  return bytes;
}

function removeMatchingFiles(directory, pattern) {
  if (!fs.existsSync(directory)) return 0;
  let freed = 0;
  for (const entry of fs.readdirSync(directory)) {
    if (!pattern.test(entry)) continue;
    const fullPath = path.join(directory, entry);
    freed += removePath(fullPath);
  }
  return freed;
}

function runCargoClean(manifestDir) {
  if (!fs.existsSync(path.join(manifestDir, 'Cargo.toml'))) return 0;
  const before = dirSizeBytes(path.join(manifestDir, 'target'));
  const result = spawnSync('cargo', ['clean'], {
    cwd: manifestDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`cargo clean failed in ${manifestDir}`);
  }
  const after = dirSizeBytes(path.join(manifestDir, 'target'));
  return Math.max(0, before - after);
}

const PLANS = {
  safe: {
    label: 'safe (orphan zip temps, logs, coverage)',
    actions(dryRun) {
      const actions = [];
      const resourcesDir = path.join(ROOT, 'src-tauri', 'resources');
      actions.push({
        label: 'standalone.zip.*.tmp in src-tauri/resources',
        run() {
          return removeMatchingFiles(resourcesDir, /^standalone\.zip\..+\.tmp$/i);
        },
        estimatePath: resourcesDir,
        match: /^standalone\.zip\..+\.tmp$/i,
      });

      for (const relativePath of ['coverage', 'logs', 'playwright-report', 'test-results']) {
        actions.push({
          label: relativePath,
          run() {
            return removePath(path.join(ROOT, relativePath));
          },
          estimatePath: path.join(ROOT, relativePath),
        });
      }

      for (const name of ROOT_LOG_GLOBS) {
        actions.push({
          label: name,
          run() {
            return removePath(path.join(ROOT, name));
          },
          estimatePath: path.join(ROOT, name),
        });
      }

      return executePlan(actions, dryRun);
    },
  },
  'rust-debug': {
    label: 'rust-debug (src-tauri/target/debug only, keeps release)',
    actions(dryRun) {
      const debugDir = path.join(ROOT, 'src-tauri', 'target', 'debug');
      return executePlan(
        [
          {
            label: 'src-tauri/target/debug',
            run() {
              return removePath(debugDir);
            },
            estimatePath: debugDir,
          },
        ],
        dryRun
      );
    },
  },
  scratch: {
    label: 'scratch (.tmp local experiments)',
    actions(dryRun) {
      return executePlan(
        [
          {
            label: '.tmp',
            run() {
              return removePath(path.join(ROOT, '.tmp'));
            },
            estimatePath: path.join(ROOT, '.tmp'),
          },
        ],
        dryRun
      );
    },
  },
  'next-cache': {
    label: 'next-cache (.next output; standalone.zip in resources is kept)',
    actions(dryRun) {
      return executePlan(
        [
          {
            label: '.next',
            run() {
              return removePath(path.join(ROOT, '.next'));
            },
            estimatePath: path.join(ROOT, '.next'),
          },
          {
            label: '.devhub-build fingerprint cache',
            run() {
              return removePath(path.join(ROOT, '.devhub-build'));
            },
            estimatePath: path.join(ROOT, '.devhub-build'),
          },
        ],
        dryRun
      );
    },
  },
  'rust-all': {
    label: 'rust-all (cargo clean devhub + windows launcher; full Rust rebuild)',
    actions(dryRun) {
      const actions = [
        {
          label: 'cargo clean src-tauri',
          run() {
            return runCargoClean(path.join(ROOT, 'src-tauri'));
          },
          estimatePath: path.join(ROOT, 'src-tauri', 'target'),
        },
        {
          label: 'cargo clean devhub-server-launcher',
          run() {
            return runCargoClean(
              path.join(ROOT, 'packaging', 'windows', 'devhub-server-launcher')
            );
          },
          estimatePath: path.join(
            ROOT,
            'packaging',
            'windows',
            'devhub-server-launcher',
            'target'
          ),
        },
      ];
      return executePlan(actions, dryRun);
    },
  },
};

function executePlan(actions, dryRun) {
  let freed = 0;
  const warnings = [];

  for (const action of actions) {
    const estimate = action.estimatePath ? dirSizeBytes(action.estimatePath) : 0;
    if (action.match && action.estimatePath && fs.existsSync(action.estimatePath)) {
      let matched = 0;
      for (const entry of fs.readdirSync(action.estimatePath)) {
        if (action.match.test(entry)) {
          matched += dirSizeBytes(path.join(action.estimatePath, entry));
        }
      }
      if (matched > 0) {
        console.log(`[clean:disk] ${dryRun ? 'would free' : 'freeing'} ~${formatMb(matched)} — ${action.label}`);
        if (dryRun) {
          freed += matched;
        } else {
          try {
            freed += action.run();
          } catch (error) {
            warnings.push(`${action.label}: ${error?.message || String(error)}`);
          }
        }
        continue;
      }
    }

    if (estimate <= 0) continue;
    console.log(`[clean:disk] ${dryRun ? 'would free' : 'freeing'} ~${formatMb(estimate)} — ${action.label}`);
    if (dryRun) {
      freed += estimate;
      continue;
    }

    try {
      freed += action.run();
    } catch (error) {
      warnings.push(`${action.label}: ${error?.message || String(error)}`);
    }
  }

  if (warnings.length > 0) {
    console.warn('[clean:disk] Some paths could not be removed (close DevHub/tauri dev/cargo and retry):');
    for (const warning of warnings) {
      console.warn(`  - ${warning}`);
    }
  }

  return freed;
}

function resolveProfile(argv) {
  const explicit = argv.find((arg) => arg.startsWith('--profile='))?.split('=')[1];
  if (explicit) return explicit;
  if (argv.includes('--aggressive')) return 'aggressive';
  return 'default';
}

function profileSteps(profile) {
  if (profile === 'aggressive') {
    return ['safe', 'rust-debug', 'scratch', 'next-cache', 'rust-all'];
  }
  if (profile === 'safe-only') return ['safe'];
  return ['safe', 'rust-debug', 'scratch'];
}

function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const profile = resolveProfile(argv);

  console.log(`[clean:disk] profile=${profile}${dryRun ? ' (dry-run)' : ''}`);

  let totalFreed = 0;
  for (const step of profileSteps(profile)) {
    const plan = PLANS[step];
    if (!plan) {
      throw new Error(`Unknown clean step: ${step}`);
    }
    console.log(`[clean:disk] step: ${plan.label}`);
    totalFreed += plan.actions(dryRun);
  }

  console.log(`[clean:disk] ${dryRun ? 'Estimated reclaim' : 'Reclaimed'}: ~${formatMb(totalFreed)}`);
  console.log('[clean:disk] Kept: src/, node_modules/, src-tauri/resources/standalone.zip, src-tauri/target/release (unless rust-all)');

  if (!dryRun && totalFreed === 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  PLANS,
  dirSizeBytes,
  profileSteps,
  removeMatchingFiles,
};