// Self-check for the incremental history length tracking used in server.js
// (avoids reduce() over the whole `history` array on every PTY data chunk).
// Run with: node sidecar-backend/history-buffer.check.js
const assert = require('node:assert');

function pushChunk(session, chunk) {
  session.history.push(chunk);
  session.historyLen = (session.historyLen || 0) + chunk.length;
  while (session.history.length > 1 && session.historyLen > 10000) {
    session.historyLen -= session.history.shift().length;
  }
}

const session = { history: [], historyLen: 0 };
for (let i = 0; i < 500; i += 1) {
  pushChunk(session, `chunk-${i}-`.repeat(5));
}

const naiveTotal = session.history.reduce((acc, s) => acc + s.length, 0);
assert.strictEqual(session.historyLen, naiveTotal, 'historyLen must match sum of chunk lengths');
assert.ok(
  session.historyLen <= 10000 || session.history.length === 1,
  'buffer must stay within cap once trimmed'
);

console.log(
  'history-buffer.check.js: OK (historyLen =',
  session.historyLen,
  ', chunks =',
  session.history.length,
  ')'
);
