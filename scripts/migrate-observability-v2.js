#!/usr/bin/env node
/**
 * Migration: Agent Observability V2 — Database Foundation
 * 
 * Applies all schema changes for Phase 1:
 * - agent_traces table + FTS5 + triggers
 * - agent_session_usage table
 * - telegram_session_map table
 * - ALTER TABLE agent_hub_sessions (4 new columns)
 * - ALTER TABLE agent_hub_messages (3 new columns)
 *
 * Usage: node scripts/migrate-observability-v2.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(process.cwd(), 'data', 'devhub.db');

function migrate() {
  console.log('🔧 Starting migration: agent-observability-v2 (Phase 1)\n');

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(DB_PATH, { fileMustExist: false, readonly: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    // T-01: agent_traces table
    console.log('  -> Creating agent_traces table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_traces (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        trace_type TEXT NOT NULL,
        agent_name TEXT,
        tool_name TEXT,
        tool_input TEXT,
        tool_output TEXT,
        tool_status TEXT,
        content TEXT,
        duration_ms INTEGER,
        time_start REAL,
        time_end REAL,
        metadata TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_traces_session ON agent_traces(session_id);
      CREATE INDEX IF NOT EXISTS idx_traces_type ON agent_traces(trace_type);
      CREATE INDEX IF NOT EXISTS idx_traces_tool ON agent_traces(tool_name);
      CREATE INDEX IF NOT EXISTS idx_traces_status ON agent_traces(tool_status);
      CREATE INDEX IF NOT EXISTS idx_traces_created ON agent_traces(created_at);
    `);
    console.log('    OK agent_traces created');

    // T-02: FTS5 virtual table
    console.log('  -> Creating FTS5 virtual table for trace search...');
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS agent_traces_fts USING fts5(
        tool_name, tool_input, tool_output, content,
        content='agent_traces',
        content_rowid='rowid'
      );
      CREATE TRIGGER IF NOT EXISTS traces_fts_insert AFTER INSERT ON agent_traces BEGIN
        INSERT INTO agent_traces_fts(rowid, tool_name, tool_input, tool_output, content)
        VALUES (new.rowid, new.tool_name, new.tool_input, new.tool_output, new.content);
      END;
      CREATE TRIGGER IF NOT EXISTS traces_fts_delete AFTER DELETE ON agent_traces BEGIN
        INSERT INTO agent_traces_fts(agent_traces_fts, rowid, tool_name, tool_input, tool_output, content)
        VALUES ('delete', old.rowid, old.tool_name, old.tool_input, old.tool_output, old.content);
      END;
      CREATE TRIGGER IF NOT EXISTS traces_fts_update AFTER UPDATE ON agent_traces BEGIN
        INSERT INTO agent_traces_fts(agent_traces_fts, rowid, tool_name, tool_input, tool_output, content)
        VALUES ('delete', old.rowid, old.tool_name, old.tool_input, old.tool_output, old.content);
        INSERT INTO agent_traces_fts(rowid, tool_name, tool_input, tool_output, content)
        VALUES (new.rowid, new.tool_name, new.tool_input, new.tool_output, new.content);
      END;
    `);
    console.log('    OK FTS5 + triggers created');

    // T-03: agent_session_usage
    console.log('  -> Creating agent_session_usage table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_session_usage (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        context_window_size INTEGER,
        context_utilization REAL,
        tool_calls_count INTEGER DEFAULT 0,
        total_duration_ms INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_usage_session ON agent_session_usage(session_id);
    `);
    console.log('    OK agent_session_usage created');

    // T-04: telegram_session_map
    console.log('  -> Creating telegram_session_map table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_session_map (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_chat_id TEXT NOT NULL UNIQUE,
        session_id TEXT NOT NULL,
        project_id TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (session_id) REFERENCES agent_hub_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tg_map_chat ON telegram_session_map(telegram_chat_id);
      CREATE INDEX IF NOT EXISTS idx_tg_map_session ON telegram_session_map(session_id);
    `);
    console.log('    OK telegram_session_map created');

    // T-05: ALTER TABLE agent_hub_sessions
    console.log('  -> Adding columns to agent_hub_sessions...');
    const sessionAlters = [
      "ALTER TABLE agent_hub_sessions ADD COLUMN telegram_chat_id TEXT",
      "ALTER TABLE agent_hub_sessions ADD COLUMN directory TEXT",
      "ALTER TABLE agent_hub_sessions ADD COLUMN status TEXT DEFAULT 'active'",
      "ALTER TABLE agent_hub_sessions ADD COLUMN opencode_session_id TEXT",
    ];
    for (const stmt of sessionAlters) {
      try {
        db.exec(stmt);
      } catch (e) {
        if (e.message.includes('duplicate column name')) {
          const colName = stmt.match(/ADD COLUMN (\w+)/)?.[1] || 'unknown';
          console.log('    SKIP Column already exists: ' + colName);
        } else {
          throw e;
        }
      }
    }
    console.log('    OK agent_hub_sessions columns added');

    // T-06: ALTER TABLE agent_hub_messages
    console.log('  -> Adding columns to agent_hub_messages...');
    const messageAlters = [
      "ALTER TABLE agent_hub_messages ADD COLUMN source TEXT DEFAULT 'web'",
      "ALTER TABLE agent_hub_messages ADD COLUMN tool_call_id TEXT",
      "ALTER TABLE agent_hub_messages ADD COLUMN tool_name TEXT",
    ];
    for (const stmt of messageAlters) {
      try {
        db.exec(stmt);
      } catch (e) {
        if (e.message.includes('duplicate column name')) {
          const colName = stmt.match(/ADD COLUMN (\w+)/)?.[1] || 'unknown';
          console.log('    SKIP Column already exists: ' + colName);
        } else {
          throw e;
        }
      }
    }
    console.log('    OK agent_hub_messages columns added');

    // Verification
    console.log('\nVerification:');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const tableNames = tables.map(t => t.name);
    
    const expectedTables = [
      'agent_traces',
      'agent_traces_fts',
      'agent_session_usage',
      'telegram_session_map',
    ];
    
    for (const t of expectedTables) {
      const exists = tableNames.includes(t);
      console.log('  ' + (exists ? 'OK' : 'FAIL') + ' Table: ' + t);
    }

    // Check new columns
    const sessionCols = db.prepare("PRAGMA table_info(agent_hub_sessions)").all();
    const sessionColNames = sessionCols.map(c => c.name);
    ['telegram_chat_id', 'directory', 'status', 'opencode_session_id'].forEach(col => {
      console.log('  ' + (sessionColNames.includes(col) ? 'OK' : 'FAIL') + ' Column: agent_hub_sessions.' + col);
    });

    const messageCols = db.prepare("PRAGMA table_info(agent_hub_messages)").all();
    const messageColNames = messageCols.map(c => c.name);
    ['source', 'tool_call_id', 'tool_name'].forEach(col => {
      console.log('  ' + (messageColNames.includes(col) ? 'OK' : 'FAIL') + ' Column: agent_hub_messages.' + col);
    });

    console.log('\nMigration completed successfully!');
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
