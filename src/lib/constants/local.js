/**
 * Canonical identifiers for the local-first / offline mode.
 * Centralized so the rest of the codebase does not hardcode the strings.
 *
 * Kept as CommonJS so it can be required by server-side/MCP code and
 * imported by Next.js client code alike.
 */
const LOCAL_USER_ID = 'local-user';
const LOCAL_USER_EMAIL = 'local@devhub.local';
const LOCAL_WORKSPACE_ID = 'local-ws';

const LOCAL_USER = Object.freeze({
  id: LOCAL_USER_ID,
  email: LOCAL_USER_EMAIL,
});

module.exports = {
  LOCAL_USER_ID,
  LOCAL_USER_EMAIL,
  LOCAL_WORKSPACE_ID,
  LOCAL_USER,
};
