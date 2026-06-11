/**
 * Pizarra State Reducer and Hook
 *
 * Manages the whiteboard canvas state: elements, selection, active tool,
 * and tool settings.
 */

import { useReducer, useCallback } from 'react';
import { TOOL_SETTINGS } from './theme';
import { SHAPE_TYPES } from './shapeModel';

// ─── Action Types ────────────────────────────────────────────────────────────

export const PIZARRA_ACTIONS = {
  SET_TOOL: 'SET_TOOL',
  SET_TOOL_SETTINGS: 'SET_TOOL_SETTINGS',
  ADD_ELEMENT: 'ADD_ELEMENT',
  UPDATE_ELEMENT: 'UPDATE_ELEMENT',
  DELETE_ELEMENT: 'DELETE_ELEMENT',
  SELECT_ELEMENTS: 'SELECT_ELEMENTS',
  DESELECT_ALL: 'DESELECT_ALL',
  CASCADE_OFFSET: 'CASCADE_OFFSET',
  RESET_ELEMENTS: 'RESET_ELEMENTS',
  // pizarra-motion-polish (P-MP-7): in-flight shape geometry
  // update during a drag. Pairs with the live preview in
  // PizarraCanvas.jsx (handleMouseMove) — the reducer action
  // exists for the canonical "draw update" path even though
  // PizarraCanvas currently keeps the preview in component-local
  // state (see the design decision in pizarra-motion-polish §
  // Decision 7). Future work that lifts the preview into the
  // reducer can dispatch this action without further changes.
  DRAW_UPDATE: 'DRAW_UPDATE',
};

// ─── Reducer ────────────────────────────────────────────────────────────────

export function pizarraReducer(state, action) {
  switch (action.type) {
    case PIZARRA_ACTIONS.SET_TOOL:
      return { ...state, activeTool: action.payload };

    case PIZARRA_ACTIONS.SET_TOOL_SETTINGS: {
      return {
        ...state,
        activeToolSettings: { ...state.activeToolSettings, ...action.payload },
      };
    }

    case PIZARRA_ACTIONS.ADD_ELEMENT: {
      return {
        ...state,
        elements: [...state.elements, action.payload],
      };
    }

    case PIZARRA_ACTIONS.UPDATE_ELEMENT: {
      const { id, changes } = action.payload;
      return {
        ...state,
        elements: state.elements.map((el) => (el.id === id ? { ...el, ...changes } : el)),
      };
    }

    case PIZARRA_ACTIONS.DELETE_ELEMENT: {
      return {
        ...state,
        elements: state.elements.filter((el) => el.id !== action.payload),
        selectedElementIds: state.selectedElementIds.filter((id) => id !== action.payload),
      };
    }

    case PIZARRA_ACTIONS.SELECT_ELEMENTS: {
      return {
        ...state,
        selectedElementIds: action.payload,
      };
    }

    case PIZARRA_ACTIONS.DESELECT_ALL: {
      return {
        ...state,
        selectedElementIds: [],
      };
    }

    case PIZARRA_ACTIONS.CASCADE_OFFSET: {
      // Cascade index wraps modulo 8 so the cascade stays near
      // canvasCenter and never escapes the viewport. DELETE_ELEMENT
      // does NOT rewind this counter — see board-element-placement
      // Req 2 ("Deleting an element does not rewind the cascade").
      const currentIndex = state.cascadeIndex ?? 0;
      const nextIndex = (currentIndex + 1) % 8;
      return {
        ...state,
        cascadeIndex: nextIndex,
      };
    }

    case PIZARRA_ACTIONS.RESET_ELEMENTS: {
      return {
        ...state,
        elements: action.payload,
        selectedElementIds: [],
        cascadeIndex: 0,
      };
    }

    // pizarra-motion-polish (P-MP-7): DRAW_UPDATE is the canonical
    // action type for the in-flight shape geometry during a drag.
    // The current PizarraCanvas implementation routes the preview
    // through component-local state, so the reducer is a no-op for
    // now (the state reference is preserved). Future work that
    // lifts the preview into the reducer can dispatch this action
    // without further contract changes.
    case PIZARRA_ACTIONS.DRAW_UPDATE: {
      return state;
    }

    default:
      return state;
  }
}

// ─── Initial State ─────────────────────────────────────────────────────────

export const PIZARRA_INITIAL_STATE = {
  elements: [],
  selectedElementIds: [],
  activeTool: 'select',
  activeToolSettings: { ...TOOL_SETTINGS },
  cascadeIndex: 0,
};

// ─── Hook ──────────────────────────────────────────────────────────────────

/**
 * Hook that provides pizarra state and dispatch actions.
 */
export function usePizarraState() {
  const [state, dispatch] = useReducer(pizarraReducer, PIZARRA_INITIAL_STATE);

  // ── Tool actions ──────────────────────────────────────────────────────

  const setTool = useCallback((tool) => {
    dispatch({ type: PIZARRA_ACTIONS.SET_TOOL, payload: tool });
  }, []);

  const setToolSettings = useCallback((settings) => {
    dispatch({ type: PIZARRA_ACTIONS.SET_TOOL_SETTINGS, payload: settings });
  }, []);

  // ── Element actions ──────────────────────────────────────────────────

  const addElement = useCallback((element) => {
    dispatch({ type: PIZARRA_ACTIONS.ADD_ELEMENT, payload: element });
  }, []);

  const updateElement = useCallback((id, changes) => {
    dispatch({ type: PIZARRA_ACTIONS.UPDATE_ELEMENT, payload: { id, changes } });
  }, []);

  const deleteElement = useCallback((id) => {
    dispatch({ type: PIZARRA_ACTIONS.DELETE_ELEMENT, payload: id });
  }, []);

  // ── Selection actions ───────────────────────────────────────────────

  const selectElement = useCallback(
    (id, multi = false) => {
      if (multi) {
        // Shift+click multi-select
        dispatch({
          type: PIZARRA_ACTIONS.SELECT_ELEMENTS,
          payload: state.selectedElementIds.includes(id)
            ? state.selectedElementIds.filter((sid) => sid !== id)
            : [...state.selectedElementIds, id],
        });
      } else {
        dispatch({ type: PIZARRA_ACTIONS.SELECT_ELEMENTS, payload: [id] });
      }
    },
    [state.selectedElementIds]
  );

  const selectElements = useCallback((ids) => {
    dispatch({ type: PIZARRA_ACTIONS.SELECT_ELEMENTS, payload: ids });
  }, []);

  const deselectAll = useCallback(() => {
    dispatch({ type: PIZARRA_ACTIONS.DESELECT_ALL });
  }, []);

  const resetElements = useCallback((elements) => {
    dispatch({ type: PIZARRA_ACTIONS.RESET_ELEMENTS, payload: elements });
  }, []);

  // ── Derived helpers ─────────────────────────────────────────────────

  const selectedElements = state.elements.filter((el) => state.selectedElementIds.includes(el.id));

  return {
    state,
    dispatch,
    setTool,
    setToolSettings,
    addElement,
    updateElement,
    deleteElement,
    resetElements,
    selectElement,
    selectElements,
    deselectAll,
    selectedElements,
  };
}
