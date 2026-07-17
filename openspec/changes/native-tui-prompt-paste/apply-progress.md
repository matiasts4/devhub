# Apply progress: native-tui-prompt-paste

## Status

Implementation complete for slice 1 (code + unit tests). Manual Grok/OpenCode smoke not run in this session.

## Done

- [x] T1 Pure coordinator `nativeTuiBootstrapPaste.js` + tests
- [x] T2 Registry `nativeTuiBootstrapRegistry.js` + tests
- [x] T3 Dispatch forwards `bootstrap_input`
- [x] T4 Tools: `launch_agent_session` interactive + bootstrap for all agents; `open_terminal` accepts `prompt`/`bootstrap_input`; intent router all programs
- [x] T5 Open handler reserves bootstrap on panel id
- [x] T6 `useNativeTuiBootstrapPaste` wired in `TerminalTTY.jsx`
- [x] T7 Focused Jest: 22/22 pass

## Files touched (implementation)

- `src/lib/asistente/nativeTuiBootstrapPaste.js` (new)
- `src/lib/asistente/nativeTuiBootstrapRegistry.js` (new)
- `src/lib/asistente/__tests__/nativeTuiBootstrapPaste.test.js` (new)
- `src/lib/asistente/__tests__/nativeTuiBootstrapRegistry.test.js` (new)
- `src/lib/asistente/dispatchZedActions.js`
- `src/lib/asistente/__tests__/dispatchZedActions.test.js`
- `src/lib/asistente/tools/agentLauncher.js`
- `src/lib/asistente/tools/terminal.js`
- `src/lib/asistente/zedIntentRouter.js`
- `src/lib/asistente/__tests__/agentLauncherTools.test.js`
- `src/components/terminal/hooks/useZedWorkspaceEvents.js`
- `src/components/terminal/hooks/useNativeTuiBootstrapPaste.js` (new)
- `src/components/TerminalTTY.jsx`

## Notes

- Enter keystroke: `'\r'`
- Timeout default: 15s
- Paste path: `formatTerminalPastePayload` + `sendTerminalPasteInput`
- Out of scope (slice 2): `execute_in_terminal` multiline on live sessions
