const logger = require('./services/activityLogger.js');
logger.logAgentEvent({
  sessionId: '123',
  agentName: 'gentleman',
  eventType: 'test',
  toolName: 'test',
  status: 'ok',
  message: 'test',
  metadata: '{"test":true}'
});
