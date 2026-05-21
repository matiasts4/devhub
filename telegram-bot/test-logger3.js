const logger = require('./services/activityLogger');
logger.logAgentEvent({
  sessionId: '123',
  agentName: 'gentleman',
  eventType: 'multiturn_start',
  message: `Multi-turn task started: prompt`,
  metadata: JSON.stringify({
    chatId: '123',
    promptLength: 10,
    opencodeSessionId: 'abc',
  }),
});
