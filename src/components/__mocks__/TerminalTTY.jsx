/**
 * Auto-mock for TerminalTTY in tests.
 * Renders nothing — terminal requires full PTY/WebSocket setup.
 */
const React = require('react');

// Shared state so test can access onResize/onClose callbacks
let mockOnResize = null;
let mockOnClose = null;

function TerminalTTY(props) {
  mockOnResize = props.onResize;
  mockOnClose = props.onClose;
  return React.createElement('div', { 'data-testid': 'mock-terminal' }, null);
}

// Allow tests to retrieve captured callbacks
TerminalTTY.getMockOnResize = () => mockOnResize;
TerminalTTY.getMockOnClose = () => mockOnClose;
TerminalTTY.resetMock = () => {
  mockOnResize = null;
  mockOnClose = null;
};

module.exports = TerminalTTY;
module.exports.default = TerminalTTY;
