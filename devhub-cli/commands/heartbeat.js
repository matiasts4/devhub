'use strict';

const { getDb, ensureWriteSchema } = require('../lib/db');

/**
 * Heartbeat command: updates last_heartbeat for a given agent_id.
 * Usage: devhub heartbeat <agent-id>
 * Exit codes: 0 = success, 1 = agent not found, 2 = missing args
 */
function heartbeat(agentId) {
  if (!agentId) {
    process.stderr.write('error: missing required argument <agent-id>\n');
    process.exit(2);
  }

  ensureWriteSchema();
  const db = getDb();
  const result = db
    .prepare("UPDATE agent_registry SET last_heartbeat = datetime('now') WHERE agent_id = ?")
    .run(agentId);

  if (result.changes === 0) {
    process.stderr.write(`warning: agent '${agentId}' not found in registry\n`);
    process.exit(1);
  }

  process.stdout.write(`Heartbeat recorded for agent '${agentId}'\n`);
  process.exit(0);
}

module.exports = heartbeat;
