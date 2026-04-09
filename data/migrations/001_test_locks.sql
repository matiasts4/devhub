-- Migration 001: test_locks table
-- Provides distributed locking mechanism for AgentHub test isolation
-- Uses SQLite's ACID properties with BEGIN IMMEDIATE for mutex behavior

CREATE TABLE IF NOT EXISTS test_locks (
  lock_id TEXT PRIMARY KEY,
  lock_type TEXT NOT NULL CHECK(lock_type IN ('session', 'endpoint', 'resource', 'flow')),
  lock_key TEXT NOT NULL,
  owner TEXT NOT NULL,
  acquired_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  metadata TEXT,
  UNIQUE(lock_type, lock_key)
);

CREATE INDEX IF NOT EXISTS idx_test_locks_expires ON test_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_test_locks_type_key ON test_locks(lock_type, lock_key);
CREATE INDEX IF NOT EXISTS idx_test_locks_owner ON test_locks(owner);
