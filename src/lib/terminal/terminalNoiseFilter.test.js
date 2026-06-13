/**
 * terminalNoiseFilter.test.js — single source of truth for the
 * DA/DSR/CPR noise filter. Both the ESM frontend (ttyServer.js,
 * TerminalTTY.jsx) and the CJS sidecar mirror (sessionTransport.js)
 * depend on this contract.
 */

import {
  SHELL_TERMINAL_RESPONSE_RE,
  stripShellTerminalResponseNoise,
  containsTerminalResponseNoise,
  filterTerminalInputForSession,
  filterTerminalOutputForSession,
} from './terminalNoiseFilter.js';

describe('SHELL_TERMINAL_RESPONSE_RE', () => {
  it('is a global regex', () => {
    expect(SHELL_TERMINAL_RESPONSE_RE.global).toBe(true);
  });
});

describe('stripShellTerminalResponseNoise', () => {
  it('returns the chunk unchanged for empty / non-string input', () => {
    expect(stripShellTerminalResponseNoise('')).toBe('');
    expect(stripShellTerminalResponseNoise(null)).toBe(null);
    expect(stripShellTerminalResponseNoise(undefined)).toBe(undefined);
  });

  it('strips DA1 (CSI ? Pd c) responses', () => {
    expect(stripShellTerminalResponseNoise('prompt\u001b[?1;2c ok')).toBe('prompt ok');
  });

  it('strips DA2 (CSI > Pp c) responses', () => {
    expect(stripShellTerminalResponseNoise('text\u001b[>0;276;0c more')).toBe('text more');
  });

  it('strips DSR (CSI Pd n) responses', () => {
    expect(stripShellTerminalResponseNoise('status\u001b[5n ok')).toBe('status ok');
  });

  it('strips CPR (CSI Pd R) responses', () => {
    expect(stripShellTerminalResponseNoise('row 1\u001b[1;1R row 2')).toBe('row 1 row 2');
  });

  it('strips window-size report (CSI 4 ; height ; width t) responses', () => {
    expect(stripShellTerminalResponseNoise('size\u001b[4;1024;1920t ok')).toBe('size ok');
    expect(stripShellTerminalResponseNoise('\u001b[4;576;1024t')).toBe('');
  });

  it('strips repeated DA cycles from TUI re-probes', () => {
    const triple = '\u001b[?1;2c\u001b[>0;276;0c'.repeat(3);
    expect(stripShellTerminalResponseNoise(triple)).toBe('');
  });
});

describe('containsTerminalResponseNoise', () => {
  it('returns true for DA1 responses', () => {
    expect(containsTerminalResponseNoise('\u001b[?1;2c')).toBe(true);
  });

  it('returns true for DA2 responses', () => {
    expect(containsTerminalResponseNoise('\u001b[>0;276;0c')).toBe(true);
  });

  it('returns true for DSR responses', () => {
    expect(containsTerminalResponseNoise('\u001b[5n')).toBe(true);
  });

  it('returns true for CPR responses', () => {
    expect(containsTerminalResponseNoise('\u001b[1;1R')).toBe(true);
  });

  it('returns true for mixed text containing a single DA fragment', () => {
    expect(containsTerminalResponseNoise('ls\u001b[?1;2c -la')).toBe(true);
  });

  it('returns false for plain text with digits and semicolons', () => {
    expect(containsTerminalResponseNoise('opencode loading 100%')).toBe(false);
    expect(containsTerminalResponseNoise('2;3s elapsed')).toBe(false);
  });

  it('returns false for SGR color escapes (styling, not responses)', () => {
    expect(containsTerminalResponseNoise('\u001b[32mOK\u001b[0m')).toBe(false);
    expect(containsTerminalResponseNoise('\u001b[31mERROR\u001b[0m: deploy failed at 1;2')).toBe(
      false
    );
  });

  it('returns false for progress-bar style output', () => {
    expect(containsTerminalResponseNoise('opencode loading 100% ▓▓▓▓▓░░░░░ 50%')).toBe(false);
    expect(containsTerminalResponseNoise('Building... 45% |#####   | 2;3s elapsed')).toBe(false);
  });

  it('returns false for empty / non-string input', () => {
    expect(containsTerminalResponseNoise('')).toBe(false);
    expect(containsTerminalResponseNoise(null)).toBe(false);
    expect(containsTerminalResponseNoise(undefined)).toBe(false);
  });
});

describe('filterTerminalInputForSession', () => {
  it('returns the chunk unchanged when there is no noise', () => {
    expect(filterTerminalInputForSession(null, 'ls -la')).toBe('ls -la');
  });

  it('returns the chunk unchanged for empty / non-string input', () => {
    expect(filterTerminalInputForSession(null, '')).toBe('');
    expect(filterTerminalInputForSession(null, null)).toBe(null);
  });

  it('drops pure DA1+DA2 answerback chunks and returns null', () => {
    expect(filterTerminalInputForSession(null, '\u001b[?1;2c\u001b[>0;276;0c')).toBeNull();
  });

  it('drops pure DSR chunks and returns null', () => {
    expect(filterTerminalInputForSession(null, '\u001b[5n')).toBeNull();
  });

  it('drops pure CPR chunks and returns null', () => {
    expect(filterTerminalInputForSession(null, '\u001b[1;1R')).toBeNull();
  });

  it('drops the exact user-reported 3× DA cycle and returns null (regression)', () => {
    // This is the exact string from the bug report. It must be dropped
    // entirely — not partially stripped.
    const bug =
      '\u001b[?1;2c\u001b[>0;276;0c\u001b[?1;2c\u001b[>0;276;0c\u001b[?1;2c\u001b[>0;276;0c';
    expect(filterTerminalInputForSession(null, bug)).toBeNull();
  });

  it('strips noise from mixed input and forwards the rest', () => {
    expect(filterTerminalInputForSession(null, 'ls\u001b[?1;2c -la')).toBe('ls -la');
  });

  it('strips noise that wraps a user keystroke', () => {
    expect(filterTerminalInputForSession(null, '\u001b[?1;2c\r\u001b[>0;276;0c')).toBe('\r');
  });

  it('does not over-strip legitimate TUI input containing digits and semicolons', () => {
    expect(filterTerminalInputForSession(null, 'echo 1;2;3')).toBe('echo 1;2;3');
    expect(filterTerminalInputForSession(null, 'opencode loading 100% ▓▓▓▓▓░░░░░ 50%')).toBe(
      'opencode loading 100% ▓▓▓▓▓░░░░░ 50%'
    );
  });

  it('does not strip SGR color escapes from input', () => {
    expect(filterTerminalInputForSession(null, '\u001b[32mOK\u001b[0m')).toBe(
      '\u001b[32mOK\u001b[0m'
    );
  });

  it('is symmetric with the output filter: same regex, same stripping', () => {
    const chunk = 'prompt\u001b[?1;2c\u001b[>0;276;0c ok\u001b[5n';
    const expected = 'prompt ok';
    expect(filterTerminalInputForSession(null, chunk)).toBe(expected);
    // Output filter shape is: stripShellTerminalResponseNoise(chunk)
    expect(stripShellTerminalResponseNoise(chunk)).toBe(expected);
  });

  it('accepts a session argument for forward-compatibility (currently informational)', () => {
    expect(filterTerminalInputForSession({ mode: 'tui' }, '\u001b[?1;2c')).toBeNull();
    expect(filterTerminalInputForSession({ mode: 'shell' }, '\u001b[?1;2c')).toBeNull();
  });

  it('drops pure focus-in/out reporting chunks and returns null', () => {
    expect(filterTerminalInputForSession(null, '\u001b[I\u001b[O')).toBeNull();
    expect(filterTerminalInputForSession(null, '\u001b[I')).toBeNull();
    expect(filterTerminalInputForSession(null, '\u001b[O')).toBeNull();
  });

  it('strips focus reporting from mixed input and forwards the rest', () => {
    expect(filterTerminalInputForSession(null, '\u001b[Il')).toBe('l');
    expect(filterTerminalInputForSession(null, '\u001b[O\r')).toBe('\r');
  });

  it('drops pure SGR mouse click reports and returns null', () => {
    expect(filterTerminalInputForSession(null, '\u001b[<0;3;3M')).toBeNull();
    expect(filterTerminalInputForSession(null, '\u001b[<2;12;4m')).toBeNull();
  });

  it('strips SGR mouse wheel reports (64/65) in shell mode', () => {
    expect(filterTerminalInputForSession(null, '\u001b[<65;12;4m')).toBeNull();
    expect(filterTerminalInputForSession(null, '\u001b[<64;8;3M')).toBeNull();
    expect(filterTerminalInputForSession({ mode: 'shell' }, '\u001b[<65;12;4m')).toBeNull();
  });

  it('forwards SGR mouse wheel reports only for live, visible TUIs', () => {
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: true }, '\u001b[<65;12;4m')
    ).toBe('\u001b[<65;12;4m');
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: true, panelHidden: true }, '\u001b[<64;8;3M')
    ).toBeNull();
  });

  it('strips SGR mouse click leaks from mixed input and forwards the rest', () => {
    expect(filterTerminalInputForSession(null, '\u001b[<0;3;3Ml')).toBe('l');
    expect(filterTerminalInputForSession(null, 'x\u001b[<65;12;4my')).toBe('xy');
  });
});

const SGR_CLICK = '\u001b[<0;3;3M';
const SGR_WHEEL_UP = '\u001b[<64;8;3M';
const SGR_WHEEL_DOWN = '\u001b[<65;12;4m';

describe('filterTerminalInputForSession — sessionContext gate', () => {
  test('forwards SGR press when ctx.mode=tui and ctx.tuiReady=true', () => {
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: true }, SGR_CLICK)
    ).toBe(SGR_CLICK);
  });

  test('strips SGR press when ctx.mode=tui and ctx.tuiReady=false', () => {
    expect(filterTerminalInputForSession({ mode: 'tui', tuiReady: false }, SGR_CLICK)).toBeNull();
  });

  test('strips SGR press when ctx.mode=shell', () => {
    expect(filterTerminalInputForSession({ mode: 'shell' }, SGR_CLICK)).toBeNull();
  });

  test('strips SGR press when ctx.panelInactive=true even if tuiReady=true', () => {
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: true, panelInactive: true }, SGR_CLICK)
    ).toBeNull();
  });

  test('strips SGR press when ctx.panelHidden=true even if tuiReady=true', () => {
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: true, panelHidden: true }, SGR_CLICK)
    ).toBeNull();
  });

  test('preserves null/undefined ctx as legacy behavior (strips)', () => {
    expect(filterTerminalInputForSession(null, SGR_CLICK)).toBeNull();
    expect(filterTerminalInputForSession(undefined, SGR_CLICK)).toBeNull();
  });

  test('preserves wheel 64/65 only for live, visible TUIs', () => {
    expect(filterTerminalInputForSession({ mode: 'tui', tuiReady: true }, SGR_WHEEL_UP)).toBe(
      SGR_WHEEL_UP
    );
    expect(filterTerminalInputForSession({ mode: 'tui', tuiReady: true }, SGR_WHEEL_DOWN)).toBe(
      SGR_WHEEL_DOWN
    );
  });

  test('strips wheel 64/65 in shell or non-ready TUI contexts', () => {
    const shapes = [null, { mode: 'shell' }, { mode: 'tui', tuiReady: false }];
    for (const ctx of shapes) {
      expect(filterTerminalInputForSession(ctx, SGR_WHEEL_UP)).toBeNull();
      expect(filterTerminalInputForSession(ctx, SGR_WHEEL_DOWN)).toBeNull();
    }
  });
});

describe('filterTerminalInputForSession — wheel regression (NFR-T03)', () => {
  test('strips wheel 64 when ctx is null', () => {
    expect(filterTerminalInputForSession(null, SGR_WHEEL_UP)).toBeNull();
  });

  test('strips wheel 65 when ctx is null', () => {
    expect(filterTerminalInputForSession(null, SGR_WHEEL_DOWN)).toBeNull();
  });

  test('strips wheel 64 when ctx.mode=shell', () => {
    expect(filterTerminalInputForSession({ mode: 'shell' }, SGR_WHEEL_UP)).toBeNull();
  });

  test('strips wheel 64 when ctx.mode=tui and tuiReady=false (bootstrap)', () => {
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: false }, SGR_WHEEL_UP)
    ).toBeNull();
  });

  test('forwards wheel 64 only when ctx.mode=tui and tuiReady=true', () => {
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: true }, SGR_WHEEL_UP)
    ).toBe(SGR_WHEEL_UP);
  });

  test('strips SGR motion reports (button 35) in all contexts including live TUIs', () => {
    const motion = '\u001b[<35;10;20M';
    expect(filterTerminalInputForSession(null, motion)).toBeNull();
    expect(filterTerminalInputForSession({ mode: 'shell' }, motion)).toBeNull();
    expect(filterTerminalInputForSession({ mode: 'tui', tuiReady: true }, motion)).toBeNull();
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: true, panelHidden: true }, motion)
    ).toBeNull();
  });

  test('strips SGR motion on inactive visible panels (pizarra hover)', () => {
    const motion = '\u001b[<35;10;20M';
    expect(
      filterTerminalInputForSession(
        { mode: 'tui', tuiReady: true, panelInactive: true },
        motion
      )
    ).toBeNull();
    expect(
      filterTerminalInputForSession(
        { mode: 'tui', tuiReady: true, panelInactive: true },
        '\u001b[<65;12;4m'
      )
    ).toBeNull();
  });

  test('click-then-scroll combined sequence preserved in tui-ready mode', () => {
    const combined = `${SGR_CLICK}${SGR_WHEEL_DOWN}`;
    expect(
      filterTerminalInputForSession({ mode: 'tui', tuiReady: true }, combined)
    ).toBe(combined);
  });
});

describe('filterTerminalOutputForSession', () => {
  it('strips DA noise from PTY output in all session modes', () => {
    const chunk = 'prompt\u001b[?1;2c\u001b[>0;276;0c ok';
    expect(filterTerminalOutputForSession({ mode: 'tui' }, chunk)).toBe('prompt ok');
    expect(filterTerminalOutputForSession({ mode: 'shell' }, chunk)).toBe('prompt ok');
  });

  it('strips SGR mouse reports from PTY output', () => {
    expect(filterTerminalOutputForSession({ mode: 'tui' }, '\u001b[<0;3;3M')).toBe('');
    expect(filterTerminalOutputForSession({ mode: 'tui' }, 'ok\u001b[<65;12;4m')).toBe('ok');
  });

  it('strips Page Up/Down wheel leak echoes from PTY output', () => {
    expect(filterTerminalOutputForSession({ mode: 'shell' }, '\u001b[5~')).toBe('');
    expect(filterTerminalOutputForSession({ mode: 'shell' }, 'prompt\u001b[6~')).toBe('prompt');
  });
});

// T2.1 — DECRQM / DECRPM (CSI ? Pd M and CSI $ Pd p) terminators.
// OpenCode TUI emits these on focus and the OpenCode-emitted responses
// were leaking as `[[35;60;4M^...` into sibling panes. The regex was
// extended to strip both terminators (M and $p). These cases are the
// regression net for that extension.
describe('T2.1 — DECRQM / DECRPM terminators (swarm-launch-hardening)', () => {
  it('T2.1 strips DECRQM (CSI ? 35 ; 60 ; 4 M) from a chunk', () => {
    // The user-visible leak in the bug report: `[[35;60;4M^...` would
    // surface in sibling panes when the OpenCode TUI emitted DECRQM on
    // focus. After the fix, the full CSI ? 35 ; 60 ; 4 M must be removed.
    expect(stripShellTerminalResponseNoise('prompt\u001b[?35;60;4M after')).toBe('prompt after');
  });

  it('T2.1 strips DECRPM (CSI $ 1 ; 2 p) from a chunk', () => {
    // DECRPM uses the literal `$` intermediate byte. The chunk must be
    // stripped entirely (returns null when pure noise).
    expect(stripShellTerminalResponseNoise('\u001b[$1;2p')).toBe('');
    expect(filterTerminalInputForSession(null, '\u001b[$1;2p')).toBeNull();
  });

  it('T2.1 reports containsTerminalResponseNoise true for DECRQM and DECRPM', () => {
    expect(containsTerminalResponseNoise('\u001b[?35;60;4M')).toBe(true);
    expect(containsTerminalResponseNoise('\u001b[$1;2p')).toBe(true);
  });
});
