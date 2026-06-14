# Delta Spec: cursor-morphology

## cursor-morphology

### ADDED Requirements

#### R1: CURSOR registry entry

Add `CURSOR: 'cursor'` to `MORPHOLOGIES` and a `MORPHOLOGY_OPTIONS` entry labeled `"Cursor"`.

##### Scenario: option appears

- GIVEN Appearance or Ajustes loads
- WHEN Morphology renders
- THEN an entry with `id === MORPHOLOGIES.CURSOR` and label `"Cursor"` exists

#### R2: cursor token block

Add `[data-morphology='cursor']` to `globals.css` with `--chrome-radius-panel: 18px`, `--chrome-radius-control: 8px`, and `--accent-primary: oklch(0.74 0.16 57)`.

##### Scenario: tokens resolve

- GIVEN `data-morphology='cursor'` is set
- WHEN variables resolve
- THEN `--chrome-radius-panel` is `18px`, `--chrome-radius-control` is `8px`, and `--accent-primary` is warm amber

#### R3: cursor applies from settings pages

Render the cursor option in `src/app/settings/appearance/page.jsx` and `src/views/Ajustes.jsx`; selecting it calls `setMorphology('cursor')`.

##### Scenario: selection updates document

- GIVEN either page is loaded
- WHEN the cursor option is clicked
- THEN `data-morphology='cursor'` is set

---

## morphology-system

### ADDED Requirements

#### R4: shared primitives use tokens

Card, Input, Switch, Dialog, Select, and Button MUST derive chrome geometry from `--chrome-*` variables or `src/chrome/morphology.js` factories.

##### Scenario: radius follows morphology

- GIVEN `data-morphology='cursor'` is active
- WHEN Card and Button render
- THEN Card radius resolves from `--chrome-radius-panel` and Button from `--chrome-radius-control`

### MODIFIED Requirements

#### R5: existing morphologies unchanged

The system MUST NOT change token values for Default, Brutalist Stage, Aura, or Switchyard. (Previously: only Switchyard.)

##### Scenario: baselines preserved

- GIVEN each existing morphology is active
- WHEN tokens are inspected
- THEN values match the pre-change baseline

---

## settings-route-canonicalization

### ADDED Requirements

#### R6: canonical settings routes, redirect, and nav links

Mount `/project/:projectId/settings/appearance`, `/llm-providers`, and `/account` in `HashRouter` via a react-router settings layout wrapper. Redirect `/project/:projectId/ajustes` to `/project/:projectId/settings/appearance`. `WorkspaceSidebar` `Ajustes` MUST link there and be active for `/settings` sub-routes. `UserProfile` account settings MUST navigate to `/project/:id/settings/account`.

##### Scenario: canonical settings are reachable and legacy route redirects

- GIVEN a workspace is open and sidebar/profile are rendered
- WHEN navigating to `/project/:id/settings/appearance`, clicking `Ajustes` or `Ajustes de Cuenta`, or visiting `/project/:id/ajustes`
- THEN the location becomes the canonical settings route

---

## llm-settings-registry-alignment

### ADDED Requirements

#### R7: backend-driven provider list

`LLMProviderSettings` MUST fetch `/api/settings/llm-providers` and derive provider keys from the response.

##### Scenario: backend providers render

- GIVEN the backend returns providers including `minimax`
- WHEN the page loads
- THEN a `minimax` card is rendered in the backend order

#### R8: metadata map and fallback

Keep a `PROVIDER_META` map (name, icon, field schema) for known providers. Unknown providers MUST render with a generic key/value UI and MUST NOT crash.

##### Scenario: known and unknown providers coexist

- GIVEN the backend returns `copilot` and `future-ai`
- WHEN the page loads
- THEN `copilot` uses metadata and `future-ai` renders generically without error

#### R9: reconcile and persist

`reconcilePriorityOrder` MUST drop stale backend keys and backfill known providers. Saving MUST use `POST /api/settings/llm-providers`; copilot device-flow MUST remain intact.

##### Scenario: save and reconcile work

- GIVEN a persisted order contains a stale key
- WHEN the page loads and the user saves
- THEN the stale key is removed and the save endpoint is called

---

## devhub-morphology-skill

### ADDED Requirements

#### R10: project-local skill file

Create `skills/devhub-morphology/SKILL.md` documenting registry files, token variables, factory usage, previews, and a morphology-extension checklist.

##### Scenario: skill is complete

- GIVEN the file exists
- WHEN an agent reads it
- THEN it contains a checklist for adding a morphology

#### R11: global installation and valid frontmatter

Copy or symlink the skill to `~/.config/opencode/skills/devhub-morphology/SKILL.md` with valid YAML frontmatter.

##### Scenario: skill is discoverable

- GIVEN OpenCode loads skills
- THEN `devhub-morphology` appears with valid frontmatter

---

## Acceptance & Verification

- `cursor` applies from Appearance and Ajustes.
- `/project/:id/settings/appearance` is reachable; `/project/:id/ajustes` redirects there.
- LLM settings lists backend providers including `minimax` and persists changes.
- Existing morphologies render identically after the change.
- `devhub-morphology` skill is installed at project and global paths.
