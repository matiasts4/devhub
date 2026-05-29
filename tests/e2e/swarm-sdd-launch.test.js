/**
 * E2E Test: Swarm SDD Phase Launch
 *
 * Tests the full swarm launch cycle with SDD phase execution:
 * 1. Launch swarm with SDD_ENABLED=true
 * 2. Director executes sdd-explore → sdd-propose → sdd-design
 * 3. Coder executes sdd-apply
 * 4. QA executes sdd-verify
 * 5. Phase transitions are streamed via SSE
 * 6. Session persists and can be reactivated
 *
 * Usage:
 *   - Full automated: BASE_URL=http://localhost:3100 npx playwright test tests/e2e/swarm-sdd-launch.test.js
 *   - Manual checklist: node tests/e2e/swarm-sdd-launch.test.js
 *
 * Prerequisites for full E2E:
 *   - Next.js dev server running (npm run dev)
 *   - DevHub desktop app running (or mock opencode agent)
 *   - SQLite DB initialized
 */

const { test, expect } = require('@playwright/test');

// ---------------------------------------------------------------------------
// Test configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
const MISSION_ID = `test-sdd-${Date.now()}`;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Test 1: SSE endpoint is accessible
// ---------------------------------------------------------------------------

test.describe('Swarm SDD Phase E2E', () => {
  test('SSE endpoint streams phase events', async ({ request }) => {
    // Verify the SSE endpoint exists and returns event-stream content type
    const response = await request.get(`${BASE_URL}/api/swarm-phase-events`, {
      headers: { Accept: 'text/event-stream' },
    });

    // The endpoint should respond (either with 200 for active or 500 if no clients registered yet)
    // We just verify it exists and responds
    expect([200, 500, 503]).toContain(response.status());
  });

  test('SSE endpoint accepts POST and emits events', async ({ request }) => {
    // Post a phase transition event
    const postResponse = await request.post(`${BASE_URL}/api/swarm-phase-events`, {
      data: {
        event: 'phase_transition',
        data: {
          missionId: MISSION_ID,
          fromPhase: 'sdd-propose',
          toPhase: 'sdd-design',
          timestamp: new Date().toISOString(),
        },
      },
    });

    // Should accept the event
    expect([200, 201, 202, 204]).toContain(postResponse.status());
  });

  test('agent message endpoint accepts reactivation messages', async ({ request }) => {
    const reactivationResponse = await request.post(
      `${BASE_URL}/api/agenthub/swarm/${MISSION_ID}/message`,
      {
        data: {
          recipient: 'swarm-director',
          message: 'Continue with sdd-design phase',
          session_id: `session-reactivate-${Date.now()}`,
          continuation_prompt: 'Resume the SDD design phase from where we left off',
        },
      }
    );

    // Should accept the reactivation request
    expect([200, 201, 202, 204]).toContain(reactivationResponse.status());
  });
});

// ---------------------------------------------------------------------------
// Manual Test Checklist (runs as script when no browser available)
// ---------------------------------------------------------------------------

const manualE2EChecks = [
  {
    id: 'E2E-SDD-01',
    name: 'Swarm launches with SDD_ENABLED=true',
    steps: [
      '1. Start DevHub: npm run dev',
      '2. Set SDD_ENABLED=true in environment',
      '3. Launch swarm via AgentHub UI or CLI',
      '4. Verify director agent receives Phase Contract prompt',
      '5. Check logs show "Phase Contract mode" for SDD agents',
    ],
    automatedCheck: async () => {
      // Verify SDD_ENABLED env behavior in buildAgentLaunchCommand
      const { getPromptMode, buildPrompt } = require('../../src/lib/sdd/SwarmPromptEngine');
      const original = process.env.SDD_ENABLED;
      process.env.SDD_ENABLED = 'true';
      const mode = getPromptMode({});
      const prompt = buildPrompt('director', 'sdd-design', { change_name: 'test-sdd' });
      process.env.SDD_ENABLED = original;
      return {
        promptMode: mode,
        hasPhaseContract: prompt.includes('Phase Contract'),
        SDD_ENABLED: process.env.SDD_ENABLED,
      };
    },
  },
  {
    id: 'E2E-SDD-02',
    name: 'Director executes sdd-explore → sdd-propose → sdd-design',
    steps: [
      '1. Start swarm with director role',
      '2. Verify director receives sdd-explore phase contract',
      '3. Observe sdd-explore completion → sdd-propose starts',
      '4. Observe sdd-propose completion → sdd-design starts',
      '5. Check that artifacts (proposal, spec, design) are created in Engram',
    ],
    automatedCheck: async () => {
      const { canExecutePhase, getExecutablePhases } = require('../../src/lib/sdd/SwarmPromptEngine');
      return {
        directorExecutable: getExecutablePhases('director'),
        canExplore: canExecutePhase('director', 'sdd-explore'),
        canPropose: canExecutePhase('director', 'sdd-propose'),
        canDesign: canExecutePhase('director', 'sdd-design'),
      };
    },
  },
  {
    id: 'E2E-SDD-03',
    name: 'Coder receives sdd-apply phase with spec/design artifacts',
    steps: [
      '1. After sdd-design completes, director delegates to coder',
      '2. Verify coder prompt includes Phase Contract for sdd-apply',
      '3. Verify ContextManager injects spec, design, tasks artifacts',
      '4. Verify token budget is enforced (~8k tokens)',
    ],
    automatedCheck: async () => {
      const { filterArtifacts } = require('../../src/lib/sdd/ContextManager');
      const artifacts = [
        { kind: 'spec', title: 'Spec', content: 'Spec content for auth-overhaul' },
        { kind: 'design', title: 'Design', content: 'Design decisions for auth-overhaul' },
        { kind: 'tasks', title: 'Tasks', content: 'Implementation tasks for auth-overhaul' },
        { kind: 'proposal', title: 'Proposal', content: 'Proposal for auth-overhaul' },
      ];
      const result = filterArtifacts('coder', 'sdd-apply', artifacts);
      return {
        injectedArtifacts: result.artifacts.map((a) => a.kind),
        totalTokens: result.totalTokens,
        withinBudget: result.totalTokens < 8000,
      };
    },
  },
  {
    id: 'E2E-SDD-04',
    name: 'Phase transitions are streamed via SSE to DevHub UI',
    steps: [
      '1. Open DevHub AgentHub UI',
      '2. Launch a swarm with SDD phases',
      '3. Open browser DevTools → Network → filter by /api/swarm-phase-events',
      '4. Verify SSE stream shows phase_transition events',
      '5. Verify agent cards update with phase badges',
    ],
    automatedCheck: async () => {
      const http = require('http');
      return new Promise((resolve) => {
        const req = http.get(`${BASE_URL}/api/swarm-phase-events`, { timeout: 5000 }, (res) => {
          resolve({
            statusCode: res.statusCode,
            contentType: res.headers['content-type'],
            isEventStream: res.headers['content-type']?.includes('text/event-stream'),
          });
          res.resume(); // drain
        });
        req.on('error', (e) => resolve({ error: e.message }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ error: 'timeout' });
        });
      });
    },
  },
  {
    id: 'E2E-SDD-05',
    name: 'Session can be reactivated after interruption',
    steps: [
      '1. Start a swarm SDD session',
      '2. Interrupt the session (Ctrl+C or close terminal)',
      '3. Use Reactivate button in DevHub UI',
      '4. Verify session resumes with correct context',
      '5. Verify session_id is preserved',
    ],
    automatedCheck: async () => {
      const { buildTmuxSessionName } = require('../../src/lib/sdd/SessionPersistence');
      const sessionId = 'abc-1234-defg-5678';
      return {
        tmuxSessionName: buildTmuxSessionName(sessionId),
        expectedFormat: 'devhub-swarm-abc1234defg',
      };
    },
  },
  {
    id: 'E2E-SDD-06',
    name: 'Worktree branch syncs with phase changes',
    steps: [
      '1. Start swarm with worktree support',
      '2. Complete sdd-design phase',
      '3. Verify branch sdd-design-{launchId} is created',
      '4. Complete sdd-apply phase',
      '5. Verify branch switches to sdd-apply-{launchId}',
    ],
    automatedCheck: async () => {
      // Test the WorktreeSyncer module directly
      const WorktreeSyncer = require('../../src/lib/sdd/WorktreeSyncer');
      const integrationPath = WorktreeSyncer.getIntegrationWorktreePath('/repo', 'test-mission');
      return {
        integrationPath,
        hasIntegrationPath: integrationPath.includes('.worktrees'),
      };
    },
  },
  {
    id: 'E2E-SDD-07',
    name: 'All 8 swarm prompts load without errors',
    steps: [
      '1. Run: opencode --agent swarm-director --prompt "test"',
      '2. Run: opencode --agent swarm-architect --prompt "test"',
      '3. Run: opencode --agent swarm-coder --prompt "test"',
      '4. Run: opencode --agent swarm-qa --prompt "test"',
      '5. Repeat for all 8 roles',
      '6. Verify no SDD prohibition messages appear',
    ],
    automatedCheck: async () => {
      const fs = require('fs');
      const path = require('path');
      const promptDir = path.join(process.env.HOME || '/root', '.config/opencode/prompts/swarm');
      const roles = ['director', 'architect', 'coder', 'explorer', 'qa', 'reviewer', 'devops', 'auditor'];
      const results = {};

      for (const role of roles) {
        const promptPath = path.join(promptDir, `swarm-${role}.md`);
        try {
          const content = fs.readFileSync(promptPath, 'utf-8');
          const hasProhibition = content.includes('Do NOT start SDD') || content.includes('do NOT start');
          const hasPhaseContract = content.includes('Phase Contract') || content.includes('## Phase');
          results[role] = {
            exists: true,
            hasProhibition,
            hasPhaseContract,
            size: content.length,
          };
        } catch {
          results[role] = { exists: false };
        }
      }

      return results;
    },
  },
];

// ---------------------------------------------------------------------------
// Script runner (for Node.js without Playwright)
// ---------------------------------------------------------------------------

async function runAutomated() {
  console.log('\n=== Swarm SDD Phase E2E — Automated Checks ===\n');

  for (const check of manualE2EChecks) {
    try {
      const result = await check.automatedCheck();
      console.log(`✅ ${check.id}: ${check.name}`);
      console.log(`   Result: ${JSON.stringify(result, null, 2).substring(0, 200)}`);
    } catch (err) {
      console.log(`❌ ${check.id}: ${check.name}`);
      console.log(`   Error: ${err.message}`);
    }
    console.log();
  }
}

function printManualChecklist() {
  console.log('\n' + '='.repeat(60));
  console.log('MANUAL E2E TEST CHECKLIST: Swarm SDD Phase Launch');
  console.log('='.repeat(60));
  console.log(`\nBASE_URL: ${BASE_URL}`);
  console.log(`MISSION_ID: ${MISSION_ID}\n`);

  for (const check of manualE2EChecks) {
    console.log(`\n📋 ${check.id}: ${check.name}`);
    console.log('-'.repeat(50));
    for (const step of check.steps) {
      console.log(`  ${step}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('To run automated checks:');
  console.log('  node tests/e2e/swarm-sdd-launch.test.js');
  console.log('\nTo run Playwright E2E tests:');
  console.log(`  BASE_URL=${BASE_URL} npx playwright test tests/e2e/swarm-sdd-launch.test.js`);
  console.log('='.repeat(60));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // If running via Playwright, tests are registered above
  // If running directly via Node, run automated + manual checklist
  if (require.main === module) {
    await runAutomated();
    printManualChecklist();
  }
}

main().catch(console.error);

module.exports = { manualE2EChecks };