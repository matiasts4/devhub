'use client';

import { useMirrorRightDockToSharedStore } from './hooks/useMirrorRightDockToSharedStore';

/** Null-render helper: mirrors right dock chrome into sharedDockState (B.2c). */
export default function RightDockSharedMirror({ rightDockState, projectId, workspaceId }) {
  useMirrorRightDockToSharedStore(rightDockState, { projectId, workspaceId });
  return null;
}
