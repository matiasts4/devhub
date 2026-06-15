# Spec: llm-settings-registry-alignment

> **Source of truth**: promoted from `openspec/changes/cursor-morphology/specs/cursor-morphology/spec.md` (R7–R9) on 2026-06-14 (archive of `cursor-morphology`).
> **Status**: active. Owned by DevHub LLM settings team.
> **Origin**: `cursor-morphology` Slice C.

## Purpose

Make `/api/settings/llm-providers` the single source of truth for the LLM provider list rendered in `LLMProviderSettings`. Replace the hardcoded frontend `PROVIDER_CONFIGS` registry with a thin frontend metadata map (`PROVIDER_META`) used only for UI concerns (name, icon, field schema), and provide a generic key/value fallback for unknown providers so the page never crashes on registry drift.

## Requirements

### Requirement: Backend-driven provider list

`LLMProviderSettings` MUST fetch `/api/settings/llm-providers` and derive the provider keys from the response. The rendered card order MUST match the backend order, and any provider present in the backend response (for example `minimax`) MUST appear in the UI.

**Files**: `src/components/settings/LLMProviderSettings.jsx`, `src/lib/llmProviderConfig.js`

#### Scenario: Backend providers render in backend order

- GIVEN the backend returns providers including `minimax` and `copilot`
- WHEN the page loads
- THEN a `minimax` card and a `copilot` card are rendered in backend order

---

### Requirement: Metadata map with generic fallback for unknown providers

The system MUST keep a `PROVIDER_META` map keyed by provider id with name, icon, and field schema for known providers. Unknown providers MUST render with a generic key/value UI and MUST NOT crash. Schema hints for unknown providers MUST follow the `deriveSchemaForUnknown` rules: keys ending in `_API_KEY` map to `password`, keys ending in `_BASE_URL` map to `url`, keys ending in `_MODEL` map to `select`, everything else maps to `text`.

**Files**: `src/components/settings/LLMProviderSettings.jsx`, `src/components/settings/ProviderCard.jsx`

#### Scenario: Known and unknown providers coexist

- GIVEN the backend returns `copilot` and `future-ai`
- WHEN the page loads
- THEN `copilot` renders using its metadata entry
- AND `future-ai` renders with a generic key/value UI without throwing

#### Scenario: deriveSchemaForUnknown hints

- GIVEN an unknown provider exposes `SOME_API_KEY`, `SOME_BASE_URL`, `SOME_MODEL`, and `SOME_REGION`
- WHEN the provider card renders
- THEN `SOME_API_KEY` is rendered as a password input
- AND `SOME_BASE_URL` is rendered as a url input
- AND `SOME_MODEL` is rendered as a select input
- AND `SOME_REGION` is rendered as a text input

---

### Requirement: Reconcile, persist, and keep copilot device flow intact

`reconcilePriorityOrder` MUST drop stale keys not present in the backend response and MUST backfill any known provider missing from the persisted order. Saving MUST `POST /api/settings/llm-providers` with the reconciled order. The existing GitHub Copilot device-flow code path MUST remain intact.

**Files**: `src/components/settings/LLMProviderSettings.jsx`

#### Scenario: Reconcile drops stale and backfills

- GIVEN the persisted order contains a stale key not in the backend response
- WHEN the page loads
- THEN the stale key is removed from the rendered order
- AND any known provider missing from the persisted order is backfilled

#### Scenario: Save persists reconciled order

- GIVEN the page is loaded with providers from the backend
- WHEN the user saves
- THEN a `POST /api/settings/llm-providers` request is made with the reconciled order

#### Scenario: Copilot device flow remains intact

- GIVEN the persisted order includes a `copilot` entry that has a valid `authState` device code
- WHEN the page loads
- THEN the device-flow UI for `copilot` is rendered and the underlying `startCopilotLogin` / `pollCopilotAuth` calls are still wired
