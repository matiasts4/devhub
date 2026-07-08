import fs from 'fs';

const src = fs.readFileSync('src/components/TerminalTTY.jsx', 'utf8');
const lines = src.split(/\r?\n/);

const extractRanges = [
  [96, 107], // cliLog
  [125, 1841], // helpers + constants through shouldBlockTerminalViewportForWebglFallback
  [1870, 1882], // resolveTerminalFontFamily
];

const chunks = extractRanges.map(([a, b]) => lines.slice(a, b + 1).join('\n'));
const body = chunks.join('\n\n');

const header = `/**
 * Pure helper exports extracted from TerminalTTY.jsx (TTY-2).
 * Stateless functions only — no React hooks.
 */

import {
  getTerminalRendererFallbackCopy,
  getTerminalRendererOptionLabel,
  resolveRendererSelection,
  TERMINAL_SPLIT_WEBGL_PANEL_LIMIT,
  TERMINAL_WEBGL_FALLBACK_REASONS,
} from '@/components/terminal/terminalRendererCapabilities';
import { usesLegacyTerminalSurvivorRecovery } from '@/lib/terminal/legacyTerminalSurvivorRecovery';
import { isAgentTuiCommand } from '@/lib/terminal/agentSessionExit';
import { detectAgentTypeFromCommand } from '@/lib/terminal/agentTuiMetadata';
import { shouldDiscardOpenCodeCatchupReplay } from '@/lib/terminal/opencodeReadyMarker';
import { isKimiLaunchCommand } from '@/lib/terminal/kimiReadyMarker';
import { getPanelInitialCommandDispatch } from '@/lib/terminal/panelInitialCommandLifecycle';
import { getTuiAdapter } from '@/lib/terminal/tuiAdapter';

const DEFAULT_TERMINAL_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

`;

const footer = `

export {
  attachTerminalRendererAddons,
  neutralizeWebglAddonForDisposal,
  isStaleXtermRendererError,
};
`;

const outPath = 'src/components/terminal/TerminalTTY.helpers.js';
fs.writeFileSync(outPath, header + body + footer);
console.log('written', outPath, fs.statSync(outPath).size, 'bytes');