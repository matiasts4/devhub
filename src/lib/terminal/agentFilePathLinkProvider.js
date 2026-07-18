/**
 * xterm ILinkProvider: file paths in Grok/OpenCode agent TUI output.
 * Activation requires Ctrl (Win/Linux) or Meta (macOS) to avoid fighting TUI mouse.
 */

import { findFilePathMatches, splitPathLineColumn } from '@/lib/terminal/filePathLinkParse';
import { resolveOpenFileTarget } from '@/lib/terminal/resolveOpenFileTarget';
import { dispatchOpenFile } from '@/lib/workspace/openFileEvent';

/**
 * @param {string} initialCommand
 * @param {{ isGrok?: (cmd: string) => boolean, isOpenCode?: (cmd: string) => boolean }} detectors
 */
export function isAgentFileLinkSession(initialCommand, detectors = {}) {
  const cmd = String(initialCommand || '');
  if (detectors.isGrok?.(cmd)) return true;
  if (detectors.isOpenCode?.(cmd)) return true;
  return false;
}

/**
 * @param {object} options
 * @param {(y: number) => string} options.getLineText — buffer line 1-based → plain text
 * @param {() => boolean} options.isEnabled
 * @param {() => { projectRoot?: string|null, cwd?: string|null, source?: string, panelId?: string }} [options.getResolveContext]
 * @param {(detail: object) => void} [options.onOpen] — default dispatchOpenFile
 */
export function createAgentFilePathLinkProvider({
  getLineText,
  isEnabled,
  getResolveContext = () => ({}),
  onOpen = dispatchOpenFile,
} = {}) {
  return {
    /**
     * @param {number} bufferLineNumber 1-based
     * @param {(links: object[]|undefined) => void} callback
     */
    provideLinks(bufferLineNumber, callback) {
      try {
        if (typeof isEnabled === 'function' && !isEnabled()) {
          callback(undefined);
          return;
        }
        const text = typeof getLineText === 'function' ? getLineText(bufferLineNumber) : '';
        if (!text) {
          callback(undefined);
          return;
        }
        const matches = findFilePathMatches(text);
        if (!matches.length) {
          callback(undefined);
          return;
        }
        const links = matches.map((match) => ({
          text: match.raw,
          range: {
            start: { x: match.startCol + 1, y: bufferLineNumber },
            end: { x: match.endCol, y: bufferLineNumber },
          },
          decorations: { pointerCursor: true, underline: true },
          activate(event, linkText) {
            const ev = event || {};
            if (!(ev.ctrlKey || ev.metaKey)) {
              return;
            }
            const parsed = splitPathLineColumn(String(linkText || match.raw));
            const path = parsed.path || match.path;
            const line = parsed.line ?? match.line;
            const column = parsed.column ?? match.column;
            const ctx = typeof getResolveContext === 'function' ? getResolveContext() : {};
            const resolved = resolveOpenFileTarget({
              rawPath: path,
              projectRoot: ctx.projectRoot || null,
              cwd: ctx.cwd || null,
            });
            if (!resolved.ok || !resolved.openPath) return;
            const detail = {
              path: resolved.openPath,
              line,
              column,
              base: ctx.projectRoot || ctx.cwd || undefined,
              source: ctx.source || 'agent-terminal',
              panelId: ctx.panelId,
            };
            onOpen(detail);
          },
        }));
        callback(links);
      } catch {
        callback(undefined);
      }
    },
  };
}

/**
 * Read a single buffer line as plain text from an xterm Terminal instance.
 * @param {import('@xterm/xterm').Terminal} term
 * @param {number} bufferLineNumber 1-based absolute buffer line
 */
export function getXtermBufferLineText(term, bufferLineNumber) {
  if (!term?.buffer?.active) return '';
  const line = term.buffer.active.getLine(bufferLineNumber - 1);
  if (!line || typeof line.translateToString !== 'function') return '';
  return line.translateToString(true);
}

/**
 * Register agent file-path links on an xterm Terminal when the launch command is Grok/OpenCode.
 * @returns {import('@xterm/xterm').IDisposable|null}
 */
export function attachAgentFilePathLinks(
  terminal,
  { panelId, initialCommand, getCwd, getProjectRoot, isGrokCommand, isOpenCodeCommand } = {}
) {
  if (!terminal || typeof terminal.registerLinkProvider !== 'function') return null;
  const enabled = isAgentFileLinkSession(initialCommand, {
    isGrok: isGrokCommand,
    isOpenCode: isOpenCodeCommand,
  });
  if (!enabled) return null;

  const provider = createAgentFilePathLinkProvider({
    isEnabled: () => true,
    getLineText: (y) => getXtermBufferLineText(terminal, y),
    getResolveContext: () => ({
      projectRoot: typeof getProjectRoot === 'function' ? getProjectRoot() : null,
      cwd: typeof getCwd === 'function' ? getCwd() : null,
      source: 'agent-terminal',
      panelId,
    }),
  });

  return terminal.registerLinkProvider(provider);
}
