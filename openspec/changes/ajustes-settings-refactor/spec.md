# Spec: ajustes-settings-refactor

> Pure structural refactor. No new capabilities — all requirements describe preserved behavior
> expressed through new component boundaries.

## Functional Requirements

### Requirement: Settings Coordinator Size

`Ajustes.jsx` MUST be reduced to ≤ 100 lines, delegating each settings section to a
dedicated component. All current settings functionality MUST be preserved with zero
user-visible regression.

#### Scenario: Coordinator renders all sections

- GIVEN the app is open and the user navigates to Settings
- WHEN `Ajustes.jsx` mounts
- THEN all 7 section components render (General, Appearance, Editor, Terminal, AI Providers, Shortcuts, About)
- AND the active tab is highlighted using shadcn `<Tabs>`

#### Scenario: Section components are isolated

- GIVEN any single section component file
- WHEN it is read in isolation
- THEN it contains only the logic and JSX for its own section (≤ 80 lines)

---

### Requirement: LLM Provider Settings Size

`LLMProviderSettings.jsx` MUST be reduced to ≤ 150 lines, delegating each provider to its
own component. Provider state reads and writes MUST produce identical side-effects as before.

#### Scenario: Provider isolation

- GIVEN the user expands a provider card (e.g., OpenRouter)
- WHEN the card mounts
- THEN only the OpenRouter-specific fields are rendered by `OpenRouterProvider`
- AND no other provider component is affected

---

### Requirement: Tab Navigation via shadcn Tabs

The settings view MUST use shadcn `<Tabs>` / `<TabsList>` / `<TabsTrigger>` / `<TabsContent>`
for section switching. Hand-rolled tab implementations MUST NOT remain.

#### Scenario: Tab switching

- GIVEN the Settings view is open on the General tab
- WHEN the user clicks the "AI Providers" tab trigger
- THEN `<TabsContent value="ai-providers">` becomes active
- AND all other `<TabsContent>` are hidden

#### Scenario: Default active tab

- GIVEN the Settings view is opened fresh (no prior state)
- WHEN it mounts
- THEN the first tab (General) is active by default

---

### Requirement: Settings Persistence Parity

All settings reads and writes MUST use the same underlying storage calls as before the
refactor. No persistence contract (key names, store paths, Tauri invoke calls) SHALL change.

#### Scenario: Value survives remount

- GIVEN the user changes a setting (e.g., toggles dark mode)
- WHEN the view is closed and reopened
- THEN the persisted value is restored correctly

#### Scenario: Write triggers same side-effect

- GIVEN a setting that has a side-effect (e.g., font size change)
- WHEN the user updates the value in the refactored component
- THEN the side-effect fires identically to pre-refactor behavior

---

### Requirement: Copilot Device-Flow OAuth Preserved

`CopilotAuthPanel` MUST encapsulate the full device-flow OAuth sequence. The flow MUST be
co-located (not split across multiple components) and MUST preserve all existing state
transitions.

#### Scenario: Device-flow happy path

- GIVEN the user is not authenticated with Copilot
- WHEN they click "Sign in with GitHub" in `CopilotAuthPanel`
- THEN the device code is requested, the verification URL is shown, and polling begins
- AND upon successful auth the panel transitions to the "authenticated" state

#### Scenario: Device-flow polling timeout

- GIVEN the device-flow is active and polling
- WHEN the grant expires (5-minute window) before the user completes auth
- THEN the panel shows an error/timeout message
- AND provides a "Try again" action

#### Scenario: Device-flow cancellation

- GIVEN the device-flow is in progress
- WHEN the user clicks "Cancel"
- THEN polling stops and the panel returns to the unauthenticated state

---

### Requirement: Shared Primitives Used Consistently

`ProviderCardShell`, `ModelPicker`, and `ProviderActions` MUST be used by ALL provider
components. Inline duplication of provider chrome MUST NOT exist.

#### Scenario: Shared shell adoption

- GIVEN any provider component file
- WHEN it is read
- THEN it imports and renders `ProviderCardShell` for its outer chrome
- AND does NOT contain hand-rolled card markup

---

## Non-Functional Requirements

### Requirement: No New Dependencies

No new npm packages SHALL be added. All UI primitives MUST come from shadcn/ui components
already present in the project (tabs, card, separator, badge, alert, switch, slider,
input, textarea, select, label, scroll-area, dialog).

#### Scenario: Dependency check

- GIVEN the refactor is complete
- WHEN `git diff package.json` is inspected
- THEN no new entries appear in `dependencies` or `devDependencies`

### Requirement: Visual Rhythm

Section cards MUST use `space-y-6` vertical rhythm and shadcn `<Card>` chrome.
Hand-rolled `div`-based card approximations MUST NOT remain in refactored sections.

---

## Out of Scope

- Functional changes to any setting behavior
- New settings categories or options
- Backend/Tauri invoke refactoring
- Changes to devhub-mcp or any non-settings code
- i18n or accessibility improvements beyond what shadcn provides

---

## Risks and Mitigations

| Risk | Level | Mitigation |
|------|-------|-----------|
| Copilot device-flow OAuth broken by extraction | Medium | Keep all auth state in `CopilotAuthPanel`; add Playwright scenario covering the full flow |
| Missed state wire-up in extracted component | Low | Strict TDD: write test per component before extracting |
| shadcn Tabs controlled vs uncontrolled mismatch | Low | Use uncontrolled (defaultValue) mode; verify default tab scenario passes |
| Bundle size regression from added imports | Low | Check build output; shadcn primitives are already tree-shaken |
