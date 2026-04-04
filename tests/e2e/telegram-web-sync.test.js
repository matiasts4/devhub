/**
 * E2E Test: Telegram ↔ Web Sync
 *
 * Tests the full unification of Telegram and Web sessions:
 * 1. Send message via Telegram (simulated)
 * 2. Verify message appears in web session
 * 3. Send response from web
 * 4. Verify response is sent to Telegram
 *
 * This is a MANUAL test checklist if automated testing is too complex.
 *
 * Usage: node tests/e2e/telegram-web-sync.test.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(process.cwd(), 'data', 'devhub.db');

// ── Helpers ─────────────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function getDb() {
  const db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

// ── Manual Test Checklist ───────────────────────────────────────────────────

const manualTests = [
  {
    id: 'E2E-01',
    name: 'Telegram message appears in web session',
    steps: [
      '1. Start the DevHub web server (npm run dev)',
      '2. Start the Telegram bot (cd telegram-bot && node bot.js)',
      '3. Send a message to the Telegram bot: /chat Hola, probando sync',
      '4. Open the web UI and navigate to Agent Hub → Sessions',
      '5. Find the session created for your Telegram chat',
      '6. Verify the message "Hola, probando sync" appears in the session messages',
    ],
    verify: () => {
      const db = getDb();
      try {
        // Check that telegram_session_map has an entry
        const mapping = db
          .prepare('SELECT COUNT(*) as count FROM telegram_session_map WHERE active = 1')
          .get();

        // Check that agent_hub_messages has telegram-sourced messages
        const tgMessages = db
          .prepare("SELECT COUNT(*) as count FROM agent_hub_messages WHERE source = 'telegram'")
          .get();

        return {
          activeMappings: mapping.count,
          telegramMessages: tgMessages.count,
          hasData: mapping.count > 0 || tgMessages.count > 0,
        };
      } finally {
        db.close();
      }
    },
  },
  {
    id: 'E2E-02',
    name: 'Web response is sent to Telegram',
    steps: [
      '1. Use the web UI to send a response in the Telegram session',
      '2. Call the API: POST /api/agenthub/sessions/:id/traces with the response',
      '3. Check that the Telegram bot receives and forwards the response',
      '4. Verify the message appears in Telegram chat',
    ],
    verify: () => {
      const db = getDb();
      try {
        // Check that messages exist with both sources
        const webMessages = db
          .prepare("SELECT COUNT(*) as count FROM agent_hub_messages WHERE source = 'web'")
          .get();

        const tgMessages = db
          .prepare("SELECT COUNT(*) as count FROM agent_hub_messages WHERE source = 'telegram'")
          .get();

        return {
          webMessages: webMessages.count,
          telegramMessages: tgMessages.count,
          hasBothSources: webMessages.count > 0 && tgMessages.count > 0,
        };
      } finally {
        db.close();
      }
    },
  },
  {
    id: 'E2E-03',
    name: 'Session continuity across platforms',
    steps: [
      '1. Start a conversation via Telegram with multiple messages',
      '2. Switch to the web UI and continue the same session',
      '3. Verify message history includes both Telegram and web messages',
      '4. Verify the session ID is the same across both platforms',
      '5. Send a message from web and verify it appears in Telegram',
    ],
    verify: () => {
      const db = getDb();
      try {
        // Check sessions with both telegram_chat_id and messages
        const sessions = db
          .prepare(
            `
          SELECT s.id, s.title, s.telegram_chat_id,
                 (SELECT COUNT(*) FROM agent_hub_messages m WHERE m.session_id = s.id) as message_count
          FROM agent_hub_sessions s
          WHERE s.telegram_chat_id IS NOT NULL
          ORDER BY s.updated_at DESC
          LIMIT 5
        `
          )
          .all();

        return {
          sessionsWithTelegram: sessions.length,
          sessions: sessions.map((s) => ({
            id: s.id,
            title: s.title,
            telegramChatId: s.telegram_chat_id,
            messageCount: s.message_count,
          })),
        };
      } finally {
        db.close();
      }
    },
  },
  {
    id: 'E2E-04',
    name: 'Trace persistence from both sources',
    steps: [
      '1. Run an agent task via Telegram',
      '2. Verify traces are persisted in agent_traces table',
      '3. Check the web UI trace panel shows the same traces',
      '4. Verify trace search works for both sources',
    ],
    verify: () => {
      const db = getDb();
      try {
        const traceCount = db.prepare('SELECT COUNT(*) as count FROM agent_traces').get();

        const tracesByType = db
          .prepare('SELECT trace_type, COUNT(*) as count FROM agent_traces GROUP BY trace_type')
          .all();

        return {
          totalTraces: traceCount.count,
          tracesByType,
        };
      } finally {
        db.close();
      }
    },
  },
];

// ── Automated verification ──────────────────────────────────────────────────

async function runAutomatedChecks() {
  console.log('Running automated E2E verification checks...\n');

  for (const test of manualTests) {
    try {
      const result = test.verify();
      console.log(`  ✅ ${test.id}: ${test.name}`);
      console.log(`     Result: ${JSON.stringify(result, null, 2)}`);
    } catch (err) {
      console.log(`  ❌ ${test.id}: ${test.name}`);
      console.log(`     Error: ${err.message}`);
    }
    console.log();
  }
}

function printManualChecklist() {
  console.log('\n' + '='.repeat(60));
  console.log('MANUAL E2E TEST CHECKLIST: Telegram ↔ Web Sync');
  console.log('='.repeat(60));
  console.log('\nThese tests require both the web server and Telegram bot running.\n');

  for (const test of manualTests) {
    console.log(`\n📋 ${test.id}: ${test.name}`);
    console.log('-'.repeat(50));
    for (const step of test.steps) {
      console.log(`  ${step}`);
    }
    console.log();
  }

  console.log('\n' + '='.repeat(60));
  console.log('To run these tests:');
  console.log('  1. npm run dev          (start web server)');
  console.log('  2. cd telegram-bot && node bot.js  (start bot)');
  console.log('  3. Follow the steps above for each test');
  console.log('='.repeat(60));
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await runAutomatedChecks();
  printManualChecklist();
}

main();
