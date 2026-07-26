'use strict';

const swarmMissions = require('./swarmMissions');
const observability = require('./observability');

module.exports = {
  ...swarmMissions,
  getSwarmConfig: observability.getSwarmConfig,
  setSwarmConfig: observability.setSwarmConfig,
  registerSwarmProcess: observability.registerSwarmProcess,
  updateSwarmProcess: observability.updateSwarmProcess,
  getSwarmProcesses: observability.getSwarmProcesses,
  removeSwarmProcess: observability.removeSwarmProcess,
  getActiveSwarmCount: observability.getActiveSwarmCount,
  getActiveAgentCount: observability.getActiveAgentCount,
};
