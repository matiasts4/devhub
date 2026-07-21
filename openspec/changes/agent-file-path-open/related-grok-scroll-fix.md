# Related fix (same timeframe): Grok cold-start scroll

Not part of the clickable file-path feature, but landed in the same working sessions.

Canonical write-up:

**`docs/errores/12-grok-cold-start-scroll/README.md`**

Symptom: first Grok panel after cold app start had dead mouse-wheel scroll until Ctrl+R or a second Grok panel. OpenCode/Kimi were fine.

Resolution: dedicated PTY SGR inject path for Grok (`src/lib/terminal/grokTuiWheelInject.js`), never native wheel passthrough for Grok.
