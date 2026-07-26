'use strict';

const constants = require('./constants');
const shared = require('./shared');
const { ensureRuntimeSchema, ensureAllSchema } = require('./schema');
const projects = require('./projects');
const tasks = require('./tasks');
const workspaces = require('./workspaces');
const swarm = require('./swarm');
const inbox = require('./inbox');
const queue = require('./queue');

function assignKeys(target, source, keys) {
  for (const key of keys) target[key] = source[key];
}

const exportGroups = [
  [projects, 'deleteByProjectId deleteByValues deleteProjectCascadeUnsafe'],
  [
    workspaces,
    'buildPrepareAgentWorkspaceAck buildWorkspaceIntentId prepareAgentWorkspaceLease validatePrepareAgentWorkspaceIdentity createAgentRun updateAgentRunTerminal appendAgentArtifact getAgentRunById getLatestAgentRunForWorkspace getLatestAgentRunForTask resolveAgentRuntimeBinding reconcileAgentRuntimeSessionBinding listAgentRuns listAgentArtifacts getLatestAgentArtifactForRun insertTrace upsertTrace getTracesBySession searchTraces updateTrace insertMessage getMessagesBySession getToolTracesBySession upsertSessionUsage getSessionUsage getSessionsByProject getRecentSessions updateSessionStatus updateSessionError updateSessionOpenCodeId provisionAuthToken revokeAuthToken getActiveAuthToken getAgentSecret verifyAuthTokenExists updateWorkspacePtyIdentity clearWorkspacePtyIdentity',
  ],
  [
    swarm,
    'createSwarmMission getSwarmMissionById registerMissionParticipant listMissionParticipants getVerifiedMissionRecipientBinding createMissionMessage listMissionMessages upsertMessageDelivery listMessageDeliveriesForMission upsertAgentPresence listAgentPresenceForMission getAgentPresenceStatus getSwarmMissionDirectorSnapshot getSwarmConfig setSwarmConfig registerSwarmProcess updateSwarmProcess getSwarmProcesses removeSwarmProcess getActiveSwarmCount getActiveAgentCount',
  ],
  [
    tasks,
    'buildSupervisorApprovalCheckpointKey getLatestTaskComment getSupervisorSnapshot listSupervisorSnapshots upsertSupervisorSnapshot getSupervisorApprovalCheckpoint listSupervisorApprovalCheckpoints upsertSupervisorApprovalCheckpoint recordTaskHistory getTaskHistory',
  ],
  [inbox, 'recordInboxItem queryOperatorInbox markInboxItemRead dismissInboxItem'],
  [
    queue,
    'enqueueDurableItem dequeueDurableItem ackDurableItem cancelDurableItem recoverStaleItems cleanupCompletedItems',
  ],
];

const exported = {
  ...constants,
  getDb: shared.getDb,
  closeDb: shared.closeDb,
  ensureRuntimeSchema,
  ensureAllSchema,
  buildSelectQuery: shared.buildSelectQuery,
  buildWhere: shared.buildWhere,
  resolveDbArgs: shared.resolveDbArgs,
  tableExists: shared.tableExists,
  tableHasColumn: shared.tableHasColumn,
  makeTableOps: shared.makeTableOps,
  tables: shared.tables,
  LocalQuery: shared.LocalQuery,
  from(table) {
    return new shared.LocalQuery(table);
  },
  db: shared.tables,
};

for (const [source, keys] of exportGroups) {
  assignKeys(exported, source, keys.split(' '));
}

module.exports = exported;
