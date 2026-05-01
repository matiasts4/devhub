#!/usr/bin/env node
/**
 * Migration: LLM Conversations → Agent Hub Messages
 *
 * Migrates existing `llm_conversations` data to `agent_hub_messages`:
 * 1. Creates an agent_hub_session for each unique chat_id (if one doesn't exist)
 * 2. Copies messages from llm_conversations to agent_hub_messages
 * 3. Sets source='telegram' for all migrated messages
 * 4. Creates telegram_session_map entry
 * 5. Logs migration progress
 *
 * This script is idempotent — safe to run multiple times.
 *
 * Usage: node scripts/migrate-llm-conversations.js
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const { resolveDbPath } = require('../src/lib/db/pathResolver');

const DB_PATH = resolveDbPath({ moduleDir: __dirname });

function migrate() {
  console.log('🔧 Starting migration: llm_conversations → agent_hub_messages\n');

  const db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  let sessionsMigrated = 0;
  let messagesCopied = 0;
  let errors = 0;
  let skippedExisting = 0;

  try {
    // Check if llm_conversations table exists
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='llm_conversations'")
      .get();

    if (!tableExists) {
      console.log('  ⏭️  Table llm_conversations does not exist. Nothing to migrate.');
      console.log('\n✅ Migration completed (no-op).');
      return;
    }

    // Get unique chat_ids
    const chatIds = db.prepare('SELECT DISTINCT chat_id FROM llm_conversations').all();

    console.log(`  📊 Found ${chatIds.length} unique chat_id(s) in llm_conversations\n`);

    for (const { chat_id } of chatIds) {
      try {
        // 1. Check if there's already a session for this chat_id
        const existingMapping = db
          .prepare('SELECT * FROM telegram_session_map WHERE telegram_chat_id = ? AND active = 1')
          .get(chat_id);

        let sessionId;

        if (existingMapping) {
          // Reuse existing session
          sessionId = existingMapping.session_id;
          skippedExisting++;
          console.log(`  ⏭️  Chat ${chat_id}: reusing existing session ${sessionId}`);
        } else {
          // 2. Create a new agent_hub_session
          sessionId = crypto.randomUUID();
          const title = `Migrated LLM Session — Chat ${chat_id}`;

          // Check if project_id is NOT NULL in the schema
          const colInfo = db.prepare('PRAGMA table_info(agent_hub_sessions)').all();
          const projectIdCol = colInfo.find((c) => c.name === 'project_id');
          const projectIdRequired = projectIdCol && projectIdCol.notnull === 1;

          if (projectIdRequired) {
            // Use a placeholder project ID for migrated sessions without a project
            db.prepare(
              `INSERT INTO agent_hub_sessions (id, project_id, title, telegram_chat_id, directory, status)
               VALUES (?, 'migrated-legacy', ?, ?, NULL, 'active')`
            ).run(sessionId, title, chat_id);
          } else {
            db.prepare(
              `INSERT INTO agent_hub_sessions (id, project_id, title, telegram_chat_id, directory, status)
               VALUES (?, NULL, ?, ?, NULL, 'active')`
            ).run(sessionId, title, chat_id);
          }

          // 4. Create telegram_session_map entry
          db.prepare(
            `INSERT INTO telegram_session_map (telegram_chat_id, session_id, project_id, active)
             VALUES (?, ?, NULL, 1)`
          ).run(chat_id, sessionId);

          sessionsMigrated++;
          console.log(`  ✅ Chat ${chat_id}: created session ${sessionId}`);
        }

        // 3. Copy messages from llm_conversations to agent_hub_messages
        const messages = db
          .prepare('SELECT * FROM llm_conversations WHERE chat_id = ? ORDER BY created_at ASC')
          .all(chat_id);

        for (const msg of messages) {
          try {
            const messageId = msg.id || crypto.randomUUID();
            const role = msg.role || (msg.is_user ? 'user' : 'assistant');
            const content = msg.content || msg.message || '';
            const meta = JSON.stringify({
              migrated_from: 'llm_conversations',
              original_id: msg.id || null,
              original_created_at: msg.created_at || null,
            });

            db.prepare(
              `INSERT OR IGNORE INTO agent_hub_messages (id, session_id, role, content, source, meta)
               VALUES (?, ?, ?, ?, 'telegram', ?)`
            ).run(messageId, sessionId, role, content, meta);

            messagesCopied++;
          } catch (err) {
            errors++;
            console.log(`  ⚠️  Error copying message ${msg.id || 'unknown'}: ${err.message}`);
          }
        }

        console.log(`     └─ ${messages.length} message(s) processed for chat ${chat_id}`);
      } catch (err) {
        errors++;
        console.log(`  ❌ Error processing chat ${chat_id}: ${err.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📋 Migration Summary');
    console.log('='.repeat(50));
    console.log(`  Sessions migrated:  ${sessionsMigrated}`);
    console.log(`  Sessions reused:    ${skippedExisting}`);
    console.log(`  Messages copied:    ${messagesCopied}`);
    console.log(`  Errors:             ${errors}`);
    console.log('='.repeat(50));

    if (errors === 0) {
      console.log('\n✅ Migration completed successfully!');
    } else {
      console.log(`\n⚠️  Migration completed with ${errors} error(s).`);
    }
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
