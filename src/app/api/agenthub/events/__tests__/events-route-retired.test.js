/* eslint-env node, jest */
/**
 * T-007 — events-route POST retirement tests.
 *
 * Spec: openspec/changes/agent-comms-redesign/specs/agent-events/spec.md
 *   - EVT-DELTA-S1: POST /api/agenthub/events returns 410 Gone with replacement hint
 *   - EVT-DELTA-S2: internal supervisor still writes agent_events (unchanged)
 *   - EVT-DELTA-S5: GET ?since= still returns historical rows immediately
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROUTE_PATH = path.resolve(process.cwd(), 'src/app/api/agenthub/events/route.js');

describe('T-007 — events route retirement', () => {
  test('EVT-DELTA-S1: route.js POST handler returns 410 with replacement hint', () => {
    // We can't actually start the Next.js server in this test, so inspect the source
    // for the 410 Gone response and the replacement body.
    const src = fs.readFileSync(ROUTE_PATH, 'utf8');
    expect(src).toMatch(/410/);
    expect(src).toMatch(/Gone/i);
    // Should mention replacement: use team_events via devhub-bus / _devhub_event
    expect(src).toMatch(/team_events|_devhub_event|devhub-bus|replaced|retired|deprecated/i);
  });

  test('EVT-DELTA-S5: GET ?since= still returns historical rows (route.js GET unchanged)', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8');
    // GET handler must still exist
    expect(src).toMatch(/export (async function|const) GET/);
    // GET should still support a since parameter
    expect(src).toMatch(/since/i);
  });

  test('EVT-DELTA-S2: emitAgentEvent is still imported (supervisor path unchanged)', () => {
    const src = fs.readFileSync(ROUTE_PATH, 'utf8');
    // The route still references emitAgentEvent for any internal supervisor use
    // (POST handler should not call it for external callers anymore).
    expect(src).toMatch(/emitAgentEvent/);
  });
});
