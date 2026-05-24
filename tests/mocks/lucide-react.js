// Mock for lucide-react to avoid hook errors in JSDOM tests
const React = require('react');

function createIcon(name) {
  return function Icon(props) {
    return React.createElement('svg', { ...props, 'data-icon': name });
  };
}

// Export all icons as a proxy
const handler = {
  get(_, key) {
    return createIcon(String(key));
  },
};

module.exports = new Proxy({}, handler);
