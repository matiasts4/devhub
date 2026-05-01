'use client';

import WorkspaceBrowserPane from './WorkspaceBrowserPane';

export default function WorkspaceBridgePane({ dockState, onDockStateChange }) {
  return (
    <WorkspaceBrowserPane
      dockState={{ ...dockState, editMode: true }}
      onDockStateChange={onDockStateChange}
      forceEditMode={true}
    />
  );
}
