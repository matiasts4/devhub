#!/usr/bin/env node
/**
 * AgentHub Test Runner CLI
 *
 * Usage:
 *   node bin/agenthub-test.js run [target]     # Run specific test or suite
 *   node bin/agenthub-test.js run --all        # Run all tests
 *   node bin/agenthub-test.js run --parallel   # Run in parallel
 *   node bin/agenthub-test.js lock <action>    # Manage locks
 *   node bin/agenthub-test.js list             # List all tests
 *   node bin/agenthub-test.js flow [name]      # Run flow test
 *
 * Options:
 *   --all          Run all test files
 *   --parallel     Run tests in parallel (uses worker pool)
 *   --lock <id>    Use specific lock ID
 *   --suite <name> Run tests from specific suite (api, mcp, flows)
 *   --timeout <ms> Global timeout (default: 30000)
 *   --verbose      Show detailed output
 *   --json         Output results as JSON
 *   --workers <n>  Number of parallel workers (default: CPU count, max 8)
 */

const { spawn, fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Constants ───────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'tests', 'agenthub');
const LOCKS_MODULE = path.join(ROOT, 'lib', 'test-locks');
const Database = require('better-sqlite3');
const { resolveDbPath } = require('../src/lib/db/pathResolver');

// ── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

function color(str, c) {
  return `${COLORS[c] || ''}${str}${COLORS.reset}`;
}

// ── Test Discovery ──────────────────────────────────────────────────────────

function discoverTests(suite) {
  const tests = [];

  const suites = suite ? [suite] : ['api', 'mcp', 'flows', 'unit'];

  for (const s of suites) {
    const suiteDir = path.join(TEST_DIR, s);
    if (!fs.existsSync(suiteDir)) continue;

    const files = fs.readdirSync(suiteDir).filter((f) => f.endsWith('.test.js'));
    for (const file of files) {
      tests.push({
        suite: s,
        name: file.replace('.test.js', ''),
        file: path.join(suiteDir, file),
        relativePath: path.relative(ROOT, path.join(suiteDir, file)),
      });
    }
  }

  // Also check root-level unit tests
  if (!suite || suite === 'unit') {
    const rootTests = fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js'));
    for (const file of rootTests) {
      tests.push({
        suite: 'unit',
        name: file.replace('.test.js', ''),
        file: path.join(TEST_DIR, file),
        relativePath: path.relative(ROOT, path.join(TEST_DIR, file)),
      });
    }
  }

  return tests;
}

// ── Lock Management ─────────────────────────────────────────────────────────

function getLockDb() {
  const dbPath = resolveDbPath({ moduleDir: ROOT });
  if (!fs.existsSync(dbPath)) {
    console.error(color('❌ Database not found at:', 'red'), dbPath);
    process.exit(1);
  }
  return new Database(dbPath, { fileMustExist: true });
}

function cmdLock(action, ...args) {
  const { status, expireStale, forceRelease, clearAll } = require(LOCKS_MODULE);
  const db = getLockDb();

  switch (action) {
    case 'status': {
      const locks = db.prepare('SELECT * FROM test_locks ORDER BY acquired_at DESC').all();
      if (locks.length === 0) {
        console.log(color('No active locks', 'dim'));
      } else {
        console.log(color(`\n🔒 Active Locks (${locks.length})`, 'bold'));
        console.log(color('─'.repeat(80), 'dim'));
        for (const lock of locks) {
          const isExpired = new Date(lock.expires_at) <= new Date();
          const statusStr = isExpired ? color('EXPIRED', 'red') : color('ACTIVE', 'green');
          console.log(
            `  ${statusStr}  ${lock.lock_type}:${lock.lock_key}  owner=${lock.owner}  expires=${lock.expires_at}`
          );
        }
        console.log('');
      }
      break;
    }

    case 'expire': {
      const now = new Date().toISOString();
      const result = db.prepare('DELETE FROM test_locks WHERE expires_at <= ?').run(now);
      console.log(color(`🧹 Expired ${result.changes} stale locks`, 'green'));
      break;
    }

    case 'release': {
      const lockId = args[0];
      if (!lockId) {
        console.error(color('Usage: agenthub-test lock release <lock-id>', 'red'));
        process.exit(1);
      }
      const result = db.prepare('DELETE FROM test_locks WHERE lock_id = ?').run(lockId);
      if (result.changes > 0) {
        console.log(color(`🔓 Released lock ${lockId}`, 'green'));
      } else {
        console.error(color(`Lock ${lockId} not found`, 'red'));
      }
      break;
    }

    case 'clear': {
      console.log(color('⚠️  This will remove ALL locks. Continue? (y/n)', 'yellow'));
      // In non-interactive mode, require --force
      if (args.includes('--force')) {
        const result = db.prepare('DELETE FROM test_locks').run();
        console.log(color(`🗑️  Cleared ${result.changes} locks`, 'green'));
      } else {
        console.log(color('Use --force to skip confirmation', 'dim'));
      }
      break;
    }

    default:
      console.error(color(`Unknown lock action: ${action}`, 'red'));
      console.log('Available: status, expire, release, clear');
      process.exit(1);
  }

  db.close();
}

// ── Test Runner ─────────────────────────────────────────────────────────────

function runTestFile(test, options = {}) {
  return new Promise((resolve) => {
    const { verbose, json } = options;
    const startTime = Date.now();

    if (!json && verbose) {
      console.log(color(`\n▶ Running: ${test.relativePath}`, 'cyan'));
    }

    // Run jest on single file
    const jest = spawn(
      'npx',
      [
        'jest',
        '--testPathPattern',
        test.relativePath,
        '--no-coverage',
        '--forceExit',
        '--detectOpenHandles',
      ],
      {
        cwd: ROOT,
        stdio: ['inherit', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '1' },
      }
    );

    let stdout = '';
    let stderr = '';

    jest.stdout.on('data', (data) => {
      stdout += data.toString();
      if (verbose && !json) {
        process.stdout.write(data);
      }
    });

    jest.stderr.on('data', (data) => {
      stderr += data.toString();
      if (verbose && !json) {
        process.stderr.write(data);
      }
    });

    jest.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        ...test,
        passed: code === 0,
        duration,
        output: stdout,
        errors: stderr,
      });
    });

    jest.on('error', (err) => {
      resolve({
        ...test,
        passed: false,
        duration: Date.now() - startTime,
        errors: err.message,
      });
    });
  });
}

async function runTests(target, options = {}) {
  const { all, parallel, suite, verbose, json, workers } = options;
  const startTime = Date.now();

  // Discover tests
  let tests = discoverTests(suite);

  // Filter by target
  if (target && !all) {
    const targetLower = target.toLowerCase();
    tests = tests.filter(
      (t) =>
        t.name.toLowerCase().includes(targetLower) ||
        t.relativePath.toLowerCase().includes(targetLower)
    );
  }

  if (tests.length === 0) {
    console.error(color(`No tests found${target ? ` matching "${target}"` : ''}`, 'red'));
    if (!json) {
      console.log(color('Available suites:', 'dim'));
      const allTests = discoverTests();
      const suites = [...new Set(allTests.map((t) => t.suite))];
      for (const s of suites) {
        const count = allTests.filter((t) => t.suite === s).length;
        console.log(color(`  ${s}: ${count} tests`, 'dim'));
      }
    }
    process.exit(1);
  }

  if (!json) {
    console.log(color(`\n🧪 Running ${tests.length} test(s)`, 'bold'));
    if (parallel) {
      console.log(color(`   Mode: Parallel (${workers || os.cpus().length} workers)`, 'cyan'));
    }
    console.log(color('─'.repeat(60), 'dim'));
  }

  // Run tests
  let results;
  if (parallel) {
    results = await runParallel(tests, { verbose, json, workers });
  } else {
    results = [];
    for (const test of tests) {
      const result = await runTestFile(test, { verbose, json });
      results.push(result);

      if (!json) {
        const icon = result.passed ? color('✓', 'green') : color('✗', 'red');
        const time = `${result.duration}ms`;
        console.log(`  ${icon} ${test.relativePath} ${color(time, 'dim')}`);
      }
    }
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const totalDuration = Date.now() - startTime;

  if (!json) {
    console.log(color('\n' + '═'.repeat(60), 'bold'));
    console.log(
      `  ${color('✓', 'green')} ${passed} passed` +
        `  ${color('✗', 'red')} ${failed} failed` +
        `  ${color('⏱', 'cyan')} ${totalDuration}ms`
    );
    console.log(color('═'.repeat(60), 'bold') + '\n');
  } else {
    console.log(
      JSON.stringify(
        {
          total: results.length,
          passed,
          failed,
          duration: totalDuration,
          tests: results.map((r) => ({
            name: r.name,
            suite: r.suite,
            passed: r.passed,
            duration: r.duration,
          })),
        },
        null,
        2
      )
    );
  }

  process.exit(failed > 0 ? 1 : 0);
}

async function runParallel(tests, options) {
  const { verbose, json, workers: maxWorkers } = options;
  const workerCount = Math.min(maxWorkers || os.cpus().length, 8, tests.length);

  if (!json && verbose) {
    console.log(color(`   Spawning ${workerCount} workers...`, 'dim'));
  }

  // Split tests among workers
  const chunks = [];
  for (let i = 0; i < workerCount; i++) {
    chunks.push(tests.filter((_, idx) => idx % workerCount === i));
  }

  const workerPromises = chunks.map((chunk) => {
    if (chunk.length === 0) return Promise.resolve([]);

    return new Promise((resolve) => {
      const worker = fork(__filename, ['__worker__'], {
        cwd: ROOT,
        env: {
          ...process.env,
          AGENTHUB_TEST_FILES: JSON.stringify(chunk.map((t) => t.relativePath)),
        },
        stdio: ['inherit', 'pipe', 'pipe', 'ipc'],
      });

      let results = [];
      worker.stdout.on('data', (data) => {
        if (verbose && !json) process.stdout.write(data);
      });
      worker.stderr.on('data', (data) => {
        if (verbose && !json) process.stderr.write(data);
      });
      worker.on('message', (msg) => {
        if (msg.type === 'results') {
          results = msg.data;
        }
      });
      worker.on('close', () => resolve(results));
    });
  });

  const allResults = await Promise.all(workerPromises);
  return allResults.flat();
}

// ── List Command ────────────────────────────────────────────────────────────

function cmdList(suite) {
  const tests = discoverTests(suite);

  console.log(color('\n📋 Available Tests', 'bold'));
  console.log(color('─'.repeat(60), 'dim'));

  const grouped = {};
  for (const test of tests) {
    if (!grouped[test.suite]) grouped[test.suite] = [];
    grouped[test.suite].push(test);
  }

  for (const [suiteName, suiteTests] of Object.entries(grouped)) {
    console.log(color(`\n  ${suiteName} (${suiteTests.length})`, 'cyan'));
    for (const test of suiteTests) {
      console.log(`    ${test.name}`);
    }
  }

  console.log(`\n${color('Total:', 'bold')} ${tests.length} tests\n`);
}

// ── Flow Command ────────────────────────────────────────────────────────────

async function cmdFlow(name, options = {}) {
  const { verbose, json } = options;
  const FlowVerifierModule = require(path.join(TEST_DIR, 'flow-verifier'));
  const { TestHarness } = require(path.join(TEST_DIR, 'harness'));
  const { seedProject } = require(path.join(TEST_DIR, 'fixtures'));

  // Run the specific flow test file via jest
  const flowFile = path.join('tests', 'agenthub', 'flows', `${name}.test.js`);
  if (!fs.existsSync(path.join(ROOT, flowFile))) {
    console.error(color(`Flow "${name}" not found. Available flows:`, 'red'));
    const flows = fs
      .readdirSync(path.join(TEST_DIR, 'flows'))
      .filter((f) => f.endsWith('.test.js'));
    for (const f of flows) {
      console.log(color(`  ${f.replace('.test.js', '')}`, 'dim'));
    }
    process.exit(1);
  }

  if (!json) {
    console.log(color(`\n🔄 Running flow: ${name}`, 'bold'));
    console.log(color('─'.repeat(60), 'dim'));
  }

  const result = await runTestFile(
    {
      suite: 'flows',
      name,
      file: path.join(ROOT, flowFile),
      relativePath: flowFile,
    },
    { verbose, json }
  );

  if (!json) {
    const icon = result.passed ? color('✓', 'green') : color('✗', 'red');
    console.log(
      `\n  ${icon} Flow "${name}" ${result.passed ? 'PASSED' : 'FAILED'} (${result.duration}ms)`
    );
  }

  process.exit(result.passed ? 0 : 1);
}

// ── Worker Mode ─────────────────────────────────────────────────────────────

async function runWorker() {
  const testFiles = JSON.parse(process.env.AGENTHUB_TEST_FILES || '[]');
  const results = [];

  for (const relativePath of testFiles) {
    const test = {
      suite: relativePath.split('/')[2] || 'unknown',
      name: path.basename(relativePath, '.test.js'),
      relativePath,
    };

    const result = await runTestFile(test, { verbose: false, json: true });
    results.push(result);
  }

  if (process.send) {
    process.send({ type: 'results', data: results });
  }

  process.exit(results.every((r) => r.passed) ? 0 : 1);
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${color('AgentHub Test Runner', 'bold')}

${color('USAGE:', 'cyan')}
  agenthub-test <command> [options]

${color('COMMANDS:', 'cyan')}
  run [target]     Run test(s). Use --all for all tests
  lock <action>    Manage test locks (status, expire, release, clear)
  list             List all available tests
  flow [name]      Run a specific flow test

${color('OPTIONS:', 'cyan')}
  --all            Run all test files
  --parallel       Run tests in parallel
  --suite <name>   Run tests from specific suite (api, mcp, flows, unit)
  --timeout <ms>   Global timeout (default: 30000)
  --verbose        Show detailed output
  --json           Output results as JSON
  --workers <n>    Number of parallel workers (default: CPU count, max 8)
  --help, -h       Show this help

${color('EXAMPLES:', 'cyan')}
  agenthub-test run headless          # Run tests matching "headless"
  agenthub-test run --all             # Run all tests sequentially
  agenthub-test run --all --parallel  # Run all tests in parallel
  agenthub-test run --suite api       # Run only API tests
  agenthub-test lock status           # Show active locks
  agenthub-test lock expire           # Remove expired locks
  agenthub-test list                  # List all tests
  agenthub-test flow headless-lifecycle  # Run a flow test
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Check for worker mode
  if (args[0] === '__worker__') {
    await runWorker();
    return;
  }

  const command = args[0] || 'help';
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = isNaN(next) ? next : Number(next);
        i++;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith('-')) {
      if (arg === '-h') flags.help = true;
    } else {
      positional.push(arg);
    }
  }

  if (flags.help) {
    printHelp();
    return;
  }

  switch (command) {
    case 'run':
      await runTests(positional[0], {
        all: flags.all,
        parallel: flags.parallel,
        suite: flags.suite,
        verbose: flags.verbose,
        json: flags.json,
        workers: flags.workers,
      });
      break;

    case 'lock':
      cmdLock(positional[0], ...positional.slice(1));
      break;

    case 'list':
      cmdList(flags.suite);
      break;

    case 'flow':
      await cmdFlow(positional[0], {
        verbose: flags.verbose,
        json: flags.json,
      });
      break;

    case 'help':
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error(color('Fatal error:', 'red'), err.message);
  process.exit(1);
});
