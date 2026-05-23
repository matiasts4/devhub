'use strict';

const {
  getDb,
  ensureWriteSchema,
  createMissionMessage,
  upsertMessageDelivery,
  isMissionMessageKind,
  MISSION_MESSAGE_KINDS,
} = require('../lib/db');

const VALID_KINDS = MISSION_MESSAGE_KINDS;
const DEFAULT_KIND = 'directive';

/**
 * Execute the tell command: validate, persist, output.
 * Called by commander with (recipient, message, options).
 */
function tellCommand(recipient, message, options) {
  // Commander may pass positional args as first two params
  const kind = options.kind || DEFAULT_KIND;
  const mission = options.mission || null;
  const sender = options.sender || null;

  // Validate positional args
  if (!recipient || !message) {
    process.stderr.write('error: usage: devhub tell <recipient> <message> --mission <id> --sender <id> [--kind <kind>]\n');
    process.exit(2);
  }

  // Validate required flags
  if (!mission) {
    process.stderr.write('error: missing required flag --mission\n');
    process.exit(2);
  }
  if (!sender) {
    process.stderr.write('error: missing required flag --sender\n');
    process.exit(2);
  }

  // Validate kind
  if (!isMissionMessageKind(kind)) {
    process.stderr.write(`error: invalid kind '${kind}'. Valid values: ${VALID_KINDS.join(', ')}\n`);
    process.exit(2);
  }

  ensureWriteSchema();
  const db = getDb();

  // Verify mission exists
  const missionRow = db.prepare('SELECT mission_id FROM swarm_missions WHERE mission_id = ? LIMIT 1').get(mission);
  if (!missionRow) {
    process.stderr.write(`error: mission '${mission}' not found\n`);
    process.exit(1);
  }

  // Create message
  const msg = createMissionMessage(db, {
    mission_id: mission,
    sender_agent_id: sender,
    message_kind: kind,
    body_summary: message,
  });

  // Create delivery
  upsertMessageDelivery(db, {
    message_id: msg.message_id,
    recipient_agent_id: recipient,
    channel: 'devhub-cli',
    status: 'pending',
  });

  // Output
  const output = {
    message_id: msg.message_id,
    recipient: recipient,
    kind: kind,
    mission: mission,
    sender: sender,
  };

  if (process.stdout.isTTY) {
    process.stdout.write(`Message sent: ${output.message_id}\n`);
    process.stdout.write(`  Recipient: ${output.recipient}\n`);
    process.stdout.write(`  Kind: ${output.kind}\n`);
    process.stdout.write(`  Mission: ${output.mission}\n`);
  } else {
    console.log(JSON.stringify(output));
  }

  process.exit(0);
}

module.exports = tellCommand;
