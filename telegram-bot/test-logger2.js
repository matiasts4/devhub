const logger = require('./services/activityLogger.js');
logger.logAgentEvent({
  sessionId: '123',
  agentName: 'gentleman',
  eventType: 'session_busy',
  message: 'Agente procesando...'
});
