import { useState, useEffect } from 'react';
import {
  createEmptyState,
  serialize,
  deserialize,
  validateState,
} from '../../lib/pizarra/stateHelpers';

const STORAGE_KEY_PREFIX = 'devhub_pizarra_state:';

/**
 * Pizarra state hook with localStorage persistence per project.
 *
 * @param {string} projectId - Project identifier for state isolation
 * @returns {{
 *   state: {
 *     elements: Map,
 *     viewport: {x: number, y: number, zoom: number},
 *     activeTool: string,
 *     toolSettings: {color: string, strokeWidth: number, fontSize: number},
 *     activeBoardId: string,
 *     boards: Map
 *   },
 *   setState: function,
 *   addElement: function,
 *   updateElement: function,
 *   removeElement: function,
 *   clearCanvas: function
 * }}
 */
export function usePizarraState(projectId) {
  // Lazy initializer — reads localStorage once on mount
  const [state, setState] = useState(() => {
    const storageKey = `${STORAGE_KEY_PREFIX}${projectId}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = deserialize(raw);
        if (parsed && validateState(parsed)) {
          // Set activeBoardId to first board when not set
          if (!parsed.activeBoardId && parsed.boards.size > 0) {
            parsed.activeBoardId = parsed.boards.keys().next().value;
          }
          return parsed;
        }
      }
    } catch {
      // Fall through to empty state
    }
    return createEmptyState();
  });

  // Debounced localStorage write on state change
  useEffect(() => {
    const storageKey = `${STORAGE_KEY_PREFIX}${projectId}`;
    let timer;
    const debouncedWrite = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, serialize(state));
        } catch {
          // Ignore storage errors — state is in memory
        }
      }, 500);
    };
    debouncedWrite();
    return () => clearTimeout(timer);
  }, [state, projectId]);

  /**
   * Add an element to the pizarra.
   * @param {object} element - Element to add (without id)
   * @returns {string} Generated elementId
   */
  const addElement = (element) => {
    const elementId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const fullElement = {
      ...element,
      id: elementId,
      createdAt: now,
      updatedAt: now,
    };
    setState((prev) => {
      const next = new Map(prev.elements);
      next.set(elementId, fullElement);
      return { ...prev, elements: next };
    });
    return elementId;
  };

  /**
   * Update an existing element by merging updates.
   * @param {string} elementId
   * @param {object} updates
   */
  const updateElement = (elementId, updates) => {
    setState((prev) => {
      if (!prev.elements.has(elementId)) return prev;
      const next = new Map(prev.elements);
      const existing = next.get(elementId);
      next.set(elementId, { ...existing, ...updates, updatedAt: Date.now() });
      return { ...prev, elements: next };
    });
  };

  /**
   * Remove an element by id.
   * @param {string} elementId
   */
  const removeElement = (elementId) => {
    setState((prev) => {
      const next = new Map(prev.elements);
      next.delete(elementId);
      return { ...prev, elements: next };
    });
  };

  /**
   * Clear all elements from the canvas.
   */
  const clearCanvas = () => {
    setState((prev) => ({ ...prev, elements: new Map() }));
  };

  return {
    state,
    setState,
    addElement,
    updateElement,
    removeElement,
    clearCanvas,
  };
}
