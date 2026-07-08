import fs from 'fs';
import path from 'path';

const twmPath = path.resolve('src/components/TerminalWorkspacesManager.jsx');
let src = fs.readFileSync(twmPath, 'utf8');

// Add renderWorkspacePanel import if missing
if (!src.includes("from './terminal/components/renderWorkspacePanel'")) {
  src = src.replace(
    "import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';",
    "import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';\nimport { renderWorkspacePanel } from './terminal/components/renderWorkspacePanel';"
  );
}

// Replace tab bar section
const tabBarStart = '            {/* Top Workspace Tab Bar */}';
const tabBarEnd = '              <WorkspaceWindowSwitcher';
const tabBarReplacement = `            <WorkspaceWindowTabBar
              workspaces={workspaces}
              activeWsId={activeWsId}
              draggedWsId={draggedWsId}
              dragOverWsId={dragOverWsId}
              browserWindowStates={browserWindowStates}
              switchWorkspace={switchWorkspace}
              handleWorkspaceTabPointerDown={handleWorkspaceTabPointerDown}
              handleWorkspaceTabPointerMove={handleWorkspaceTabPointerMove}
              endWorkspaceTabDrag={endWorkspaceTabDrag}
              addWorkspace={addWorkspace}
              removeWorkspace={removeWorkspace}
              closeWorkspaceBrowserWindow={closeWorkspaceBrowserWindow}
              getWorkspaceDisplayLabel={getWorkspaceDisplayLabel}
              getAllPanelIds={getAllPanelIds}
            />

              <WorkspaceWindowSwitcher`;

const tabStartIdx = src.indexOf(tabBarStart);
const tabEndIdx = src.indexOf(tabBarEnd, tabStartIdx);
if (tabStartIdx !== -1 && tabEndIdx !== -1) {
  src = src.slice(0, tabStartIdx) + tabBarReplacement + src.slice(tabEndIdx);
}

// Replace workspace shell return block with WorkspaceTerminalSurface
const shellReturnStart = '                      return (\n                        <div\n                          key={workspaceGridKey}';
const shellReturnEnd = '                        </div>\n                      );';
const shellStartIdx = src.indexOf(shellReturnStart);
if (shellStartIdx !== -1) {
  let depth = 0;
  let i = shellStartIdx + '                      return ('.length;
  let endIdx = -1;
  while (i < src.length) {
    if (src.slice(i, i + 4) === '<div') depth++;
    if (src.slice(i, i + 6) === '</div>') {
      depth--;
      if (depth === 0) {
        endIdx = src.indexOf(');', i);
        break;
      }
    }
    i++;
  }
  if (endIdx !== -1) {
    const replacement = `                      return (
                        <WorkspaceTerminalSurface
                          key={workspaceGridKey}
                          ws={ws}
                          workspaceGridKey={workspaceGridKey}
                          activeWsId={activeWsId}
                          isVisible={isVisible}
                          isFullscreenBrowser={isFullscreenBrowser}
                          hideRightDockPanel={hideRightDockPanel}
                          wsDockState={wsDockState}
                          workspaceWindows={workspaceWindows}
                          activeWindowIds={activeWindowIds}
                          focusedPanelId={focusedPanelId}
                          totalTerminalPanelCount={totalTerminalPanelCount}
                          isWorkspaceVisibleInLayout={isWorkspaceVisibleInLayout}
                          panelSubtabsBarRef={panelSubtabsBarRef}
                          rightDockPlaceholderRef={rightDockPlaceholderRef}
                          renderWorkspaceWindowBar={(workspace, dockState) =>
                            renderWorkspaceWindowBar(workspace, dockState, updateWsDockState)
                          }
                          renderWorkspacePanelSlot={renderWorkspacePanelSlot}
                          resolvePanelVisibleInLayout={resolvePanelVisibleInLayout}
                          handleSplit={handleSplit}
                          handlePanelGroupLayout={handlePanelGroupLayout}
                          handleInternalSplitDragging={handleInternalSplitDragging}
                          handleDockDragging={handleDockDragging}
                          handleRightDockPanelResize={handleRightDockPanelResize}
                        />
                      );`;
    src = src.slice(0, shellStartIdx) + replacement + src.slice(endIdx + 2);
  }
}

fs.writeFileSync(twmPath, src);
console.log('TWM JSX wiring complete');