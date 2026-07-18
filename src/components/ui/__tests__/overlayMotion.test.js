/**
 * @jest-environment node
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  OVERLAY_MODAL_MOTION,
  OVERLAY_POPOVER_MOTION,
  OVERLAY_SCRIM_MOTION,
  OVERLAY_SHEET_MOTION,
} = require('../overlayMotion');

const UI_DIR = path.join(__dirname, '..');

function readUi(name) {
  return fs.readFileSync(path.join(UI_DIR, name), 'utf8');
}

describe('overlayMotion contracts', () => {
  test('scrim/modal/menus are 100ms; sheets are 200ms; no diagonal modal slides', () => {
    expect(OVERLAY_SCRIM_MOTION).toMatch(/duration-100/);
    expect(OVERLAY_SCRIM_MOTION).toMatch(/bg-black\/30/);
    expect(OVERLAY_SCRIM_MOTION).toMatch(/backdrop-blur/);
    expect(OVERLAY_MODAL_MOTION).toMatch(/duration-100/);
    expect(OVERLAY_MODAL_MOTION).toMatch(/zoom-in-95/);
    expect(OVERLAY_MODAL_MOTION).not.toMatch(/slide-in-from-(left|top)/);
    expect(OVERLAY_POPOVER_MOTION).toMatch(/duration-100/);
    expect(OVERLAY_SHEET_MOTION).toMatch(/data-\[state=closed\]:duration-200/);
    expect(OVERLAY_SHEET_MOTION).toMatch(/data-\[state=open\]:duration-200/);
    expect(OVERLAY_SHEET_MOTION).not.toMatch(/duration-(3|5)00/);
  });

  test('dialog / alert-dialog / sheet wire shared tokens with short-travel slides', () => {
    const dialog = readUi('dialog.jsx');
    const alert = readUi('alert-dialog.jsx');
    const sheet = readUi('sheet.jsx');

    expect(dialog).toMatch(/OVERLAY_MODAL_MOTION/);
    expect(dialog).toMatch(/OVERLAY_SCRIM_MOTION/);
    expect(alert).toMatch(/OVERLAY_MODAL_MOTION/);
    expect(sheet).toMatch(/OVERLAY_SHEET_MOTION/);
    expect(sheet).toMatch(/slide-in-from-right-10/);
    expect(sheet).not.toMatch(/duration-300|duration-500/);
  });

  test('menus and popovers use OVERLAY_POPOVER_MOTION', () => {
    for (const file of [
      'dropdown-menu.jsx',
      'popover.jsx',
      'select.jsx',
      'tooltip.jsx',
      'hover-card.jsx',
      'context-menu.jsx',
      'menubar.jsx',
    ]) {
      expect(readUi(file)).toMatch(/OVERLAY_POPOVER_MOTION/);
    }
  });

  test('globals.css defines premium motion kit and reduced snap', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../app/globals.css'), 'utf8');
    expect(css).toMatch(/--motion-dur-fast:\s*160ms/);
    expect(css).toMatch(/--motion-ease-premium:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    expect(css).toMatch(/\.dh-panel-in/);
    expect(css).toMatch(
      /html\[data-motion-mode='reduced'\][\s\S]*?\.animate-in[\s\S]*?animation-duration:\s*1ms/
    );
  });
});
