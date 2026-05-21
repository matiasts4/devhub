const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec('CREATE TABLE agent_logs (id TEXT PRIMARY KEY, session_id TEXT, agent_name TEXT, event_type TEXT, tool_name TEXT, status TEXT, message TEXT, metadata TEXT, duration_ms INTEGER);');
const insertAgentLog = db.prepare('INSERT INTO agent_logs (id, session_id, agent_name, event_type, tool_name, status, message, metadata, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
try {
  let eventType = undefined;
  insertAgentLog.run('1', '2', '3', eventType, '5', '6', '7', '8', '9');
} catch (e) {
  console.log('TEST 1:', e.message);
}

try {
  let status = undefined;
  insertAgentLog.run('1', '2', '3', '4', '5', status, '7', '8', '9');
} catch (e) {
  console.log('TEST 2:', e.message);
}

