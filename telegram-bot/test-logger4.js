const db = require('./lib/db-bridge').db;
const insertAgentLog = db.prepare(`
  INSERT INTO agent_logs
    (id, session_id, agent_name, event_type, tool_name, status, message, metadata, duration_ms)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
console.log('Placeholders count:', insertAgentLog.source);
