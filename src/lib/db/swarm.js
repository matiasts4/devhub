'use strict';

const swarmMissions = require('./swarmMissions');
const telegram = require('./telegram');
const observability = require('./observability');

module.exports = {
  ...swarmMissions,
  ...telegram,
  getSwarmConfig: observability.getSwarmConfig,
  setSwarmConfig: observability.setSwarmConfig,
  registerSwarmProcess: observability.registerSwarmProcess,
  updateSwarmProcess: observability.updateSwarmProcess,
  getSwarmProcesses: observability.getSwarmProcesses,
  removeSwarmProcess: observability.removeSwarmProcess,
  getActiveSwarmCount: observability.getActiveSwarmCount,
  getActiveAgentCount: observability.getActiveAgentCount,
};
