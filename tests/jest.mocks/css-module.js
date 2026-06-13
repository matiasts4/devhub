/**
 * Global CSS module mock for Jest.
 * Returns an object mapping class names to their class name.
 * This allows tests to use className matching on DOM elements.
 */
module.exports = new Proxy({}, {
  get(target, prop) {
    if (prop === 'toString') return () => '[css-module]';
    return `mock-${prop}`;
  },
});
