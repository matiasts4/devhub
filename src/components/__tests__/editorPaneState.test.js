const {
  DEFAULT_EDITOR_PANE_STATE,
  EMBEDDED_TREE_DEFAULT_WIDTH_PX,
  EMBEDDED_TREE_MAX_WIDTH_PX,
  EMBEDDED_TREE_MIN_WIDTH_PX,
  sanitizeEditorPaneState,
} = require('../workspace/editorPaneState');

describe('editorPaneState embedded tree width', () => {
  test('defaults and clamps embeddedTreeWidthPx', () => {
    expect(DEFAULT_EDITOR_PANE_STATE.embeddedTreeWidthPx).toBe(EMBEDDED_TREE_DEFAULT_WIDTH_PX);
    expect(sanitizeEditorPaneState({}).embeddedTreeWidthPx).toBe(EMBEDDED_TREE_DEFAULT_WIDTH_PX);
    expect(sanitizeEditorPaneState({ embeddedTreeWidthPx: 90 }).embeddedTreeWidthPx).toBe(
      EMBEDDED_TREE_MIN_WIDTH_PX
    );
    expect(sanitizeEditorPaneState({ embeddedTreeWidthPx: 999 }).embeddedTreeWidthPx).toBe(
      EMBEDDED_TREE_MAX_WIDTH_PX
    );
    expect(sanitizeEditorPaneState({ embeddedTreeWidthPx: 240.7 }).embeddedTreeWidthPx).toBe(241);
  });
});
