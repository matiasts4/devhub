# Design: ajustes-settings-refactor

## Technical Approach

Pure extraction refactor: slice Ajustes.jsx and LLMProviderSettings.jsx into isolated
leaf components, wire them via a thin coordinator, and replace hand-rolled tabs with
shadcn `<Tabs>`. No logic moves — only containment boundaries change.

---

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Tab identity scheme | `defaultValue="general"` (uncontrolled) | URL hash, controlled state | No routing needed; default-tab spec satisfied without extra wiring |
| Settings state ownership | Each section receives its slice as props + `onChange` | Global context in SettingsLayout | Matches current pattern; avoids new abstraction |
| Copilot auth isolation | All OAuth state inside `CopilotAuthPanel` only | lift to LLMProviderSettings | Prevents polling leak; co-location is the spec requirement |
| Shared card chrome | `ProviderCardShell` wraps every provider | per-provider card markup | Eliminates duplication; single place to fix visual rhythm |

---

## Component Tree

```
Ajustes.jsx  (~80 lines, coordinator)
├── reads: useOutletContext, localClient, theme utils
├── passes: settings slices + onChange callbacks
└── renders: SettingsLayout
    └── <Tabs defaultValue="general">
        ├── <TabsList>  (7 triggers)
        └── <TabsContent value="general">     → GeneralSection
            <TabsContent value="appearance">  → AppearanceSection
            <TabsContent value="editor">      → EditorSection
            <TabsContent value="terminal">    → TerminalSection
            <TabsContent value="ai-providers">→ LLMProviderSettings (~130 lines, sub-coordinator)
            │   ├── CopilotProvider
            │   │   └── ProviderCardShell + CopilotAuthPanel + ModelPicker + ProviderActions
            │   ├── OpenCodeProvider
            │   │   └── ProviderCardShell + ModelPicker + ProviderActions
            │   ├── OpenRouterProvider
            │   │   └── ProviderCardShell + ModelPicker + ProviderActions
            │   ├── ZenProvider
            │   │   └── ProviderCardShell + ModelPicker + ProviderActions
            │   └── DirectProvider
            │       └── ProviderCardShell + ModelPicker + ProviderActions
            <TabsContent value="shortcuts">   → ShortcutsSection
            <TabsContent value="about">       → AboutSection
```

Node legend — each leaf receives: `(settingsSlice, onChange)` props only.

---

## Data Flow

```
Ajustes.jsx
  │  reads all settings (localClient / localStorage / Tauri invoke)
  │  owns all top-level state (theme, accentColor, editorSettings, …)
  │
  ├─→ GeneralSection(props, onChange)   writes back via onChange → Ajustes saves
  ├─→ AppearanceSection(props, onChange)
  ├─→ LLMProviderSettings(providerSettings, onChange)
  │     ├─→ CopilotProvider(copilotSlice, onChange)
  │     │     └─→ CopilotAuthPanel()   ← owns device-flow state; no props out except onAuthChange
  │     └─→ {Other}Provider(slice, onChange)
  └─→ …sections
```

Storage calls (`invoke`, `localStorage.setItem`, `createClient`) remain exactly where
they are today — they move with the extracted component, not up to the coordinator.

---

## Interfaces / Contracts

```js
// Shared section contract
// props: whatever the section currently reads; onChange mirrors current write calls
<GeneralSection settings={generalSlice} onChange={handleGeneralChange} />

// ProviderCardShell
<ProviderCardShell
  name={string}          // "GitHub Copilot"
  description={string}
  icon={LucideIcon}
  priority={number}
  isEnabled={bool}
  onToggle={fn}
>
  {children}             // provider-specific fields
</ProviderCardShell>

// ModelPicker
<ModelPicker
  value={string}
  options={string[]}
  loading={bool}
  onRefresh={fn}
  onChange={fn}
/>

// ProviderActions
<ProviderActions
  onTest={fn}
  onSave={fn}
  isSaving={bool}
  isTesting={bool}
  testResult={"ok"|"error"|null}
/>

// CopilotAuthPanel — owns ALL device-flow state internally
<CopilotAuthPanel
  isAuthenticated={bool}
  onAuthChange={fn}      // called when auth state transitions
/>
// Internal state: deviceCode, verificationUri, pollInterval, pollTimer, timeout
```

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/views/Ajustes.jsx` | Modify | Reduce to ≤ 100 lines coordinator; remove inline section JSX |
| `src/views/settings/GeneralSection.jsx` | Create | General settings section |
| `src/views/settings/AppearanceSection.jsx` | Create | Theme, accent, visual settings |
| `src/views/settings/EditorSection.jsx` | Create | Editor preferences |
| `src/views/settings/TerminalSection.jsx` | Create | Terminal settings |
| `src/views/settings/ShortcutsSection.jsx` | Create | Keyboard shortcuts |
| `src/views/settings/AboutSection.jsx` | Create | About / version info |
| `src/components/settings/LLMProviderSettings.jsx` | Modify | Reduce to ≤ 150 lines sub-coordinator |
| `src/components/settings/providers/CopilotProvider.jsx` | Create | Copilot card + CopilotAuthPanel |
| `src/components/settings/providers/OpenCodeProvider.jsx` | Create | OpenCode card |
| `src/components/settings/providers/OpenRouterProvider.jsx` | Create | OpenRouter card |
| `src/components/settings/providers/ZenProvider.jsx` | Create | Zen card |
| `src/components/settings/providers/DirectProvider.jsx` | Create | Direct/custom endpoint card |
| `src/components/settings/providers/CopilotAuthPanel.jsx` | Create | Device-flow OAuth; all poll state here |
| `src/components/settings/shared/ProviderCardShell.jsx` | Create | Shared provider card chrome |
| `src/components/settings/shared/ModelPicker.jsx` | Create | Model select + refresh |
| `src/components/settings/shared/ProviderActions.jsx` | Create | Test + Save action bar |

---

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Each section renders without crash | Vitest + RTL, mock props |
| Unit | `CopilotAuthPanel` state machine (idle → polling → authed / timeout / cancel) | Vitest, mock `invoke`, fake timers |
| Unit | `ProviderCardShell` / `ModelPicker` / `ProviderActions` prop contracts | RTL smoke tests |
| Integration | Tab switching shows correct `TabsContent` | RTL, `userEvent.click` |
| E2E | Copilot device-flow happy path | Playwright scenario (see spec risk table) |

---

## Migration / Rollout

No migration required. Files are replaced in-place; no DB or storage schema changes.
Route path for Settings stays the same.

---

## Open Questions

- [ ] Does `SettingsLayout` need to exist as a separate file, or is the `<Tabs>` block
      inline in `Ajustes.jsx` sufficient? (Coordinator at ≤ 100 lines suggests inline is fine.)
- [ ] Are there Playwright tests already? If not, the E2E Copilot scenario needs scaffolding
      before the extraction task begins.
