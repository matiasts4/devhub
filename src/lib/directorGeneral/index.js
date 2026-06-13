/**
 * @module directorGeneral
 * DG bridge barrel — re-exports all DG modules and the React hook.
 */

'use strict';

// Core modules
const bridge = require('./bridge');
const polling = require('./polling');
const timeline = require('./timeline');

// React hook (lazy-loaded to avoid SSR issues)
let _useDirectorGeneralBridge = null;
function getHook() {
  if (!_useDirectorGeneralBridge) {
    // eslint-disable-next-line global-require
    _useDirectorGeneralBridge = require('./useDirectorGeneralBridge').default;
  }
  return _useDirectorGeneralBridge;
}

module.exports = {
  // Bridge client
  submitMissionRequest: bridge.submitMissionRequest,
  postApprovalReply: bridge.postApprovalReply,
  getMissionStatus: bridge.getMissionStatus,
  getMissionTimeline: bridge.getMissionTimeline,
  getActiveMissionId: bridge.getActiveMissionId,
  setActiveMission: bridge.setActiveMission,
  clearActiveMission: bridge.clearActiveMission,
  isActiveMissionTerminal: bridge.isActiveMissionTerminal,
  // Polling
  startPolling: polling.startPolling,
  // Timeline
  emitRow: timeline.emitRow,
  buildTimelineRow: timeline.buildTimelineRow,
  // React hook
  get useDirectorGeneralBridge() {
    return getHook();
  },
};
