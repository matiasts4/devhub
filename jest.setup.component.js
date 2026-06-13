/* eslint-disable no-undef */
/**
 * Jest setup for component tests with jsdom environment.
 * Used by component tests that need DOM APIs.
 *
 * `globalThis`, `window`, and `jest` are all available in the jest
 * jsdom runtime; the eslint config in this repo does not have a
 * dedicated section for root-level *.setup.*.js files, so we silence
 * the no-undef check at the file level (the global surface is
 * governed by jest's setupFilesAfterEnv contract).
 */

import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill TextEncoder/TextDecoder for jsdom.
// globalThis is the spec-compliant way to access the global object; it
// works in jsdom (browser-like) and in the node test runtime. Using
// `global` (Node-only) would trip the eslint no-undef check in
// browser-configured files, so we avoid that here.
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

// Mock matchMedia for framer-motion and other libraries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
};

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};
