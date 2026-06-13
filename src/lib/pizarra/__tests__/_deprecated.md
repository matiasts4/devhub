# Deprecation marker — usePizarraModeTransition

> The orphan `usePizarraModeTransition` module (and its test) were
> deleted in `pizarra-motion-polish` task **P-MP-2**.

**Reason for deletion**:

- Imported `MODE_TRANSITION` from `@/components/ui/system/motion-tokens`,
  which does not export that name — runtime/compile-time failure.
- Zero production consumers (`grep -r usePizarraModeTransition src/`
  returned only the test file).
- Redundant with the canonical path: `useModeTransition` (in
  `src/lib/pizarra/useModeTransition.js`) + `ModeTransitionShell`
  (in `src/lib/pizarra/ModeTransitionShell.jsx`).

**Regression test**: `usePizarraOrphan.test.js` in this directory
asserts the file is gone, the module cannot be `require()`d, and
`git grep` returns zero hits outside this marker.

**See**: `openspec/changes/pizarra-motion-polish/proposal.md` §"Orphan
cleanup" and the spec `pizarra-mode-transition` requirement
"Hook is the only production path".
