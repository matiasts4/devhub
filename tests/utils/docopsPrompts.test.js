import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  enforceDocOpsGateOnLaunchCommand,
  buildDocOpsGateLanguage,
} from '../../src/lib/docopsPrompts.js';

describe('DocOps launch command enforcement', () => {
  it('injects the DocOps gate into doc/planning orchestrator launches', () => {
    const command =
      'opencode --agent sdd-orchestrator --prompt "Necesito documentar el roadmap del proyecto"';

    const enforced = enforceDocOpsGateOnLaunchCommand(command);

    assert.notStrictEqual(enforced, command);
    assert.match(enforced, /validate_topic_key/);
    assert.match(enforced, /build_context_pack/);
    assert.match(enforced, /opencode --agent sdd-orchestrator --prompt/);
  });

  it('leaves non-doc orchestrator launches untouched', () => {
    const command = 'opencode --agent sdd-orchestrator --prompt "Refactorizar el layout"';

    const enforced = enforceDocOpsGateOnLaunchCommand(command);

    assert.strictEqual(enforced, command);
  });

  it('keeps the gate language reusable as text', () => {
    assert.match(buildDocOpsGateLanguage(), /validate_topic_key/);
  });
});
