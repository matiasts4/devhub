# Proposal: Operator Action Contract

## Intent

Decision: define one canonical in-DevHub Operator action contract before shipping timeline, Observer/Operator UI, or Director General control. Today roadmap points 1-5 name the surfaces, but not the policy contract that makes them safe and reviewable. This change creates the shared taxonomy, permission model, risk tiers, confirmation policy, and audit expectations that every later slice must reuse.

## Scope

### In Scope

- Define canonical action families and ids for terminal, browser, agent, swarm, logs, and layout/focus operations inside DevHub.
- Define actor permissions for observer, operator, director, and internal/system execution.
- Define risk tiers and confirmation rules, including deny-by-default and deferred critical actions.
- Define the minimum audit/timeline payload every action must emit.
- Define the boundary between DevHub intents, policy enforcement, adapters, and existing MCP/server tools.

### Out of Scope

- Implementing timeline UI, Observer UI, Operator mode, or Director General orchestration.
- Voice, canvas/pizarra, or any standalone product outside DevHub.
- Exhaustive per-command shell allowlists or prompt wording.

## Capabilities

### New Capabilities

- `operator-action-contract`: canonical action taxonomy, permission model, risk tiers, and confirmation policy for Operator/Director actions inside DevHub.

### Modified Capabilities

- `mcp-public-contract`: clarify that internal Operator actions MAY compose existing adapters/tools without silently expanding the public MCP surface.

## Approach

Create a contract-first spec with four action classes: observe, navigate, mutate, and orchestrate. Each action MUST declare `action_id`, params, target, actor role, risk tier, confirmation policy, audit payload, and rollback posture. Enforcement MUST be defense-in-depth across intent router, policy layer, adapter boundary, and tool invocation.

## Confirmation Expectations

- Low risk: read/focus/log actions MAY auto-run.
- Medium risk: bounded environment changes SHOULD require one clear confirmation.
- High risk: execution, delegation, or state-changing actions MUST require explicit human confirmation and auditable rationale.
- Critical risk: destructive, credential-impacting, or cross-workspace actions stay denied or deferred from the first cut.

This must precede timeline, observer UI, operator mode, and director-general because those slices otherwise invent incompatible names, permissions, and confirmation semantics.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/operator-action-contract/spec.md` | New | Normative contract for action taxonomy and policy |
| `openspec/specs/mcp-public-contract/spec.md` | Modified | Public/internal boundary clarification |
| `docs/Implementaciones_Futuras.md` | Governs | Foundation for roadmap steps 1-5 |
| `devhub-mcp/server.js` | Future Modified | Bound adapter/tool mapping to canonical action ids |
| `src/lib/operations/*` / future operator policy modules | Future Modified | Shared permission, confirmation, and audit enforcement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Contract stays too abstract | Med | Require concrete examples per action class and tier |
| Public MCP and internal actions blur | Med | Separate action ids from public tool names |
| Scope expands into implementation | High | Keep this slice planning-only and defer critical actions |

## Rollback Plan

If the contract proves premature, keep it as planning-only documentation and defer dependent slices. No runtime behavior ships from this change alone; rollback is narrowing or archiving the spec without product migration.

## Dependencies

- `docs/Implementaciones_Futuras.md` roadmap steps 1-5.
- Existing MCP public contract and snapshot-first control surfaces.

## Success Criteria

- [ ] Collaborators can classify every planned Operator/Director action by taxonomy, actor, risk tier, and confirmation policy.
- [ ] Timeline, Observer UI, Operator mode, and Director General planning can reuse the same canonical action ids and audit schema.
- [ ] The plan keeps the Operator inside DevHub and defers canvas/voice/standalone expansion.