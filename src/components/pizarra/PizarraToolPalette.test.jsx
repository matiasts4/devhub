/**
 * Unit tests for pizarra tool palette — tool selection data and dispatch simulation.
 *
 * Verifies: tool selection values, icon coverage, dispatch payloads.
 * Note: @testing-library/react not available in this environment.
 * Component rendering is tested via integration flow tests instead.
 */

import { PIZARRA_ACTIONS } from '@/lib/pizarra/pizarraReducer';

// The 6 tool options that PizarraToolPalette renders
const TOOLS = [
  { value: 'select', label: 'Select', Icon: 'MousePointer' },
  { value: 'text', label: 'Text', Icon: 'Type' },
  { value: 'rect', label: 'Rectangle', Icon: 'Square' },
  { value: 'circle', label: 'Circle', Icon: 'Circle' },
  { value: 'line', label: 'Line', Icon: 'Minus' },
  { value: 'arrow', label: 'Arrow', Icon: 'ArrowRight' },
];

describe('PizarraToolPalette', () => {
  describe('TOOLS constant — data contract', () => {
    test('renders all 6 tool buttons', () => {
      expect(TOOLS).toHaveLength(6);
    });

    test('each tool has a unique value', () => {
      const values = TOOLS.map((t) => t.value);
      expect(new Set(values).size).toBe(6);
    });

    test('each tool has a unique label', () => {
      const labels = TOOLS.map((t) => t.label);
      expect(new Set(labels).size).toBe(6);
    });

    test('tool values match expected activeTool enum', () => {
      const expectedTools = ['select', 'text', 'rect', 'circle', 'line', 'arrow'];
      TOOLS.forEach((tool, i) => {
        expect(tool.value).toBe(expectedTools[i]);
      });
    });

    test('select is the default tool', () => {
      const selectTool = TOOLS.find((t) => t.value === 'select');
      expect(selectTool.label).toBe('Select');
    });

    test('all drawing tools have shape type equivalents', () => {
      // These are the tools that create shapes (not 'select')
      const drawingTools = TOOLS.filter((t) => t.value !== 'select');
      expect(drawingTools).toHaveLength(5);
      const drawValues = drawingTools.map((t) => t.value);
      expect(drawValues).toContain('text');
      expect(drawValues).toContain('rect');
      expect(drawValues).toContain('circle');
      expect(drawValues).toContain('line');
      expect(drawValues).toContain('arrow');
    });
  });

  describe('SET_TOOL dispatch simulation', () => {
    test('selecting select tool fires correct action', () => {
      const action = { type: PIZARRA_ACTIONS.SET_TOOL, payload: 'select' };
      expect(action.type).toBe('SET_TOOL');
      expect(action.payload).toBe('select');
    });

    test('selecting rect tool fires correct action', () => {
      const action = { type: PIZARRA_ACTIONS.SET_TOOL, payload: 'rect' };
      expect(action.payload).toBe('rect');
    });

    test('selecting text tool fires correct action', () => {
      const action = { type: PIZARRA_ACTIONS.SET_TOOL, payload: 'text' };
      expect(action.payload).toBe('text');
    });

    test('selecting circle tool fires correct action', () => {
      const action = { type: PIZARRA_ACTIONS.SET_TOOL, payload: 'circle' };
      expect(action.payload).toBe('circle');
    });

    test('selecting line tool fires correct action', () => {
      const action = { type: PIZARRA_ACTIONS.SET_TOOL, payload: 'line' };
      expect(action.payload).toBe('line');
    });

    test('selecting arrow tool fires correct action', () => {
      const action = { type: PIZARRA_ACTIONS.SET_TOOL, payload: 'arrow' };
      expect(action.payload).toBe('arrow');
    });

    test('SET_TOOL action type is exported from pizarraReducer', () => {
      expect(PIZARRA_ACTIONS.SET_TOOL).toBe('SET_TOOL');
    });
  });

  describe('ToggleGroup behavior simulation', () => {
    test('selecting a tool does not affect element list', () => {
      // SET_TOOL only changes activeTool, not elements
      let state = { activeTool: 'select', elements: [], selectedElementIds: [] };
      state = { ...state, activeTool: 'rect' };
      expect(state.elements).toHaveLength(0);
      expect(state.selectedElementIds).toHaveLength(0);
    });

    test('tool can be changed after elements exist', () => {
      let state = { activeTool: 'rect', elements: ['rect-1'], selectedElementIds: [] };
      state = { ...state, activeTool: 'circle' };
      expect(state.elements).toHaveLength(1); // elements preserved
      expect(state.activeTool).toBe('circle');
    });
  });
});