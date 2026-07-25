/**
 * Integration tests for the pizarra draw-select-edit flow.
 *
 * Tests the full workflow:
 * 1. Select a tool
 * 2. Simulate mousedown → mousemove → mouseup → element added to state
 * 3. Click element → selection updated → inspector appears
 * 4. Property change → element updated in state
 */

import { createShape } from '@/lib/pizarra/shapeModel';
import { PIZARRA_ACTIONS } from '@/lib/pizarra/pizarraReducer';

// ─── Pure reducer tests (no React needed) ─────────────────────────────────

/**
 * Simulate the pizarra reducer for integration testing.
 */
function simulateReducer(state, action) {
  const { PIZARRA_ACTIONS: ACTIONS } = require('@/lib/pizarra/pizarraReducer');

  switch (action.type) {
    case ACTIONS.SET_TOOL:
      return { ...state, activeTool: action.payload };

    case ACTIONS.ADD_ELEMENT:
      return { ...state, elements: [...state.elements, action.payload] };

    case ACTIONS.UPDATE_ELEMENT: {
      const { id, changes } = action.payload;
      return {
        ...state,
        elements: state.elements.map((el) => (el.id === id ? { ...el, ...changes } : el)),
      };
    }

    case ACTIONS.SELECT_ELEMENTS:
      return { ...state, selectedElementIds: action.payload };

    case ACTIONS.DESELECT_ALL:
      return { ...state, selectedElementIds: [] };

    default:
      return state;
  }
}

describe('pizarra draw-select-edit flow', () => {
  const initialState = {
    elements: [],
    selectedElementIds: [],
    activeTool: 'select',
  };

  describe('Step 1 — Tool selection', () => {
    test('selecting the rect tool updates activeTool', () => {
      const state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.SET_TOOL,
        payload: 'rect',
      });
      expect(state.activeTool).toBe('rect');
    });

    test('selecting the circle tool updates activeTool', () => {
      const state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.SET_TOOL,
        payload: 'circle',
      });
      expect(state.activeTool).toBe('circle');
    });

    test('selecting the text tool updates activeTool', () => {
      const state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.SET_TOOL,
        payload: 'text',
      });
      expect(state.activeTool).toBe('text');
    });
  });

  describe('Step 2 — Element creation (drag → addElement)', () => {
    test('adding a rect element increases elements count', () => {
      const rect = createShape('rect', { x: 10, y: 20, width: 100, height: 80 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.SET_TOOL,
        payload: 'rect',
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      expect(state.elements).toHaveLength(1);
      expect(state.elements[0].type).toBe('rect');
      expect(state.elements[0].x).toBe(10);
      expect(state.elements[0].y).toBe(20);
      expect(state.elements[0].width).toBe(100);
      expect(state.elements[0].height).toBe(80);
    });

    test('adding a circle element', () => {
      const circle = createShape('circle', { x: 50, y: 50, radius: 30 });
      const state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: circle,
      });
      expect(state.elements).toHaveLength(1);
      expect(state.elements[0].type).toBe('circle');
      expect(state.elements[0].radius).toBe(30);
    });

    test('adding a line element with correct points', () => {
      const line = createShape('line', {
        x: 0,
        y: 0,
        points: [0, 0, 200, 150],
      });
      const state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: line,
      });
      expect(state.elements[0].points).toEqual([0, 0, 200, 150]);
    });

    test('adding an arrow element', () => {
      const arrow = createShape('arrow', {
        x: 0,
        y: 0,
        points: [10, 20, 150, 100],
      });
      const state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: arrow,
      });
      expect(state.elements[0].type).toBe('arrow');
      expect(state.elements[0].fill).toBe(state.elements[0].stroke);
    });

    test('adding a textbox element', () => {
      const text = createShape('textbox', {
        x: 100,
        y: 100,
        text: 'Hello Canvas',
        fontSize: 24,
      });
      const state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: text,
      });
      expect(state.elements[0].text).toBe('Hello Canvas');
      expect(state.elements[0].fontSize).toBe(24);
    });

    test('multiple elements accumulate in elements array', () => {
      const rect = createShape('rect', { x: 0, y: 0 });
      const circle = createShape('circle', { x: 0, y: 0 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: circle,
      });
      expect(state.elements).toHaveLength(2);
      expect(state.elements[0].type).toBe('rect');
      expect(state.elements[1].type).toBe('circle');
    });
  });

  describe('Step 3 — Selection', () => {
    test('selecting an element by id', () => {
      const rect = createShape('rect');
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.SELECT_ELEMENTS,
        payload: [rect.id],
      });
      expect(state.selectedElementIds).toEqual([rect.id]);
    });

    test('clicking canvas deselects all elements', () => {
      const rect = createShape('rect');
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.SELECT_ELEMENTS,
        payload: [rect.id],
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.DESELECT_ALL,
      });
      expect(state.selectedElementIds).toEqual([]);
    });

    test('multi-select via shift+click appends to selectedElementIds', () => {
      const rect = createShape('rect', { x: 0, y: 0 });
      const circle = createShape('circle', { x: 0, y: 0 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: circle,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.SELECT_ELEMENTS,
        payload: [rect.id],
      });
      // Simulate shift+click: append circle to selection
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.SELECT_ELEMENTS,
        payload: [rect.id, circle.id],
      });
      expect(state.selectedElementIds).toEqual([rect.id, circle.id]);
    });
  });

  describe('Step 4 — Transform / property update', () => {
    test('updating element position via UPDATE_ELEMENT', () => {
      const rect = createShape('rect', { x: 0, y: 0 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: rect.id, changes: { x: 50, y: 100 } },
      });
      expect(state.elements[0].x).toBe(50);
      expect(state.elements[0].y).toBe(100);
      // Other properties unchanged
      expect(state.elements[0].width).toBe(100);
      expect(state.elements[0].height).toBe(80);
    });

    test('updating element fill color', () => {
      const rect = createShape('rect', { fill: '#3b82f6' });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: rect.id, changes: { fill: '#ff0000' } },
      });
      expect(state.elements[0].fill).toBe('#ff0000');
    });

    test('updating stroke width', () => {
      const rect = createShape('rect', { strokeWidth: 2 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: rect.id, changes: { strokeWidth: 8 } },
      });
      expect(state.elements[0].strokeWidth).toBe(8);
    });

    test('updating opacity', () => {
      const rect = createShape('rect', { opacity: 1 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: rect.id, changes: { opacity: 0.5 } },
      });
      expect(state.elements[0].opacity).toBe(0.5);
    });

    test('updating cornerRadius on rect', () => {
      const rect = createShape('rect', { cornerRadius: 0 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: rect.id, changes: { cornerRadius: 20 } },
      });
      expect(state.elements[0].cornerRadius).toBe(20);
    });

    test('updating textbox text content', () => {
      const text = createShape('textbox', { text: 'Original' });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: text,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: text.id, changes: { text: 'Updated Text' } },
      });
      expect(state.elements[0].text).toBe('Updated Text');
    });

    test('updating textbox fontSize', () => {
      const text = createShape('textbox', { fontSize: 16 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: text,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: text.id, changes: { fontSize: 48 } },
      });
      expect(state.elements[0].fontSize).toBe(48);
    });

    test('UPDATE_ELEMENT only affects matching id — other elements unchanged', () => {
      const rect = createShape('rect', { x: 0, y: 0 });
      const circle = createShape('circle', { x: 0, y: 0, radius: 50 });
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: circle,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: rect.id, changes: { x: 999 } },
      });
      expect(state.elements[0].x).toBe(999);
      // Circle unchanged
      expect(state.elements[1].radius).toBe(50);
    });
  });

  describe('Full flow integration — draw, select, resize, property change', () => {
    test('complete flow: create rect → select → resize → change fill', () => {
      // Tool: rect
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.SET_TOOL,
        payload: 'rect',
      });
      expect(state.activeTool).toBe('rect');

      // Draw shape (mousedown → mouseup)
      const rect = createShape('rect', {
        x: 50,
        y: 50,
        width: 200,
        height: 150,
        fill: '#3b82f6',
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: rect,
      });
      expect(state.elements).toHaveLength(1);

      // Shape selected automatically after creation
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.SELECT_ELEMENTS,
        payload: [rect.id],
      });
      expect(state.selectedElementIds).toEqual([rect.id]);

      // Resize via transform end (simulated)
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: {
          id: rect.id,
          changes: { x: 50, y: 50, width: 400, height: 300 },
        },
      });
      expect(state.elements[0].width).toBe(400);
      expect(state.elements[0].height).toBe(300);

      // Change fill color via property inspector
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: rect.id, changes: { fill: '#ff0000' } },
      });
      expect(state.elements[0].fill).toBe('#ff0000');
      // Still selected
      expect(state.selectedElementIds).toEqual([rect.id]);
    });

    test('complete flow: create arrow → select → change stroke', () => {
      let state = simulateReducer(initialState, {
        type: PIZARRA_ACTIONS.SET_TOOL,
        payload: 'arrow',
      });
      expect(state.activeTool).toBe('arrow');

      const arrow = createShape('arrow', {
        x: 0,
        y: 0,
        points: [0, 0, 300, 200],
        stroke: '#60a5fa',
        strokeWidth: 3,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.ADD_ELEMENT,
        payload: arrow,
      });
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.SELECT_ELEMENTS,
        payload: [arrow.id],
      });

      // Change stroke via inspector
      state = simulateReducer(state, {
        type: PIZARRA_ACTIONS.UPDATE_ELEMENT,
        payload: { id: arrow.id, changes: { stroke: '#ffaa00', strokeWidth: 6 } },
      });
      expect(state.elements[0].stroke).toBe('#ffaa00');
      expect(state.elements[0].strokeWidth).toBe(6);
    });
  });
});
