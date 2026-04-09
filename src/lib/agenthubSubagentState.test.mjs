import { strict as assert } from 'node:assert';
import {
  normalizeSubagentStatus,
  normalizeSubagentName,
  isStaleSessionForSubagentMessage,
} from './agenthubSubagentState.js';

assert.equal(normalizeSubagentStatus('completed'), 'success');
assert.equal(normalizeSubagentStatus('error'), 'error');
assert.equal(normalizeSubagentStatus('aborted'), 'aborted');
assert.equal(normalizeSubagentStatus('active'), 'running');
assert.equal(normalizeSubagentStatus('thinking'), 'running');
assert.equal(normalizeSubagentStatus('busy'), 'running');
assert.equal(normalizeSubagentStatus('retry'), 'running');
assert.equal(normalizeSubagentStatus('idle'), 'success');

assert.equal(normalizeSubagentName('build'), 'sdd-orchestrator');
assert.equal(normalizeSubagentName('qa'), 'sdd-orchestrator');
assert.equal(normalizeSubagentName('sdd-apply'), 'sdd-apply');
assert.equal(normalizeSubagentName('  sdd-design  '), 'sdd-design');

const staleSession = { session_id: 'child-session-123', opencode_session_id: 'opencode-abc' };

assert.equal(
  isStaleSessionForSubagentMessage(staleSession, {
    meta: JSON.stringify({ childSessionId: 'child-session-123' }),
    session_id: 'parent-session-999',
  }),
  true
);

assert.equal(
  isStaleSessionForSubagentMessage(staleSession, {
    meta: JSON.stringify({ sessionId: 'opencode-abc' }),
    session_id: 'parent-session-999',
  }),
  true
);

assert.equal(
  isStaleSessionForSubagentMessage(staleSession, {
    meta: JSON.stringify({ childSessionId: 'different-child' }),
    session_id: 'child-session-123',
  }),
  false
);
