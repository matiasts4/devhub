import fs from 'fs';
import path from 'path';

const twmPath = path.resolve('src/components/TerminalWorkspacesManager.jsx');
let src = fs.readFileSync(twmPath, 'utf8');

if (!src.includes("import { renderWorkspacePanel }")) {
  src = src.replace(
    "import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';",
    "import useSwarmLaunchController from './terminal/hooks/useSwarmLaunchController';\nimport { renderWorkspacePanel } from './terminal/components/renderWorkspacePanel';"
  );
}

const start = '                      return (\n                        <div\n                          key={workspaceGridKey}';
const end = '                        </div>\n                      );';
const si = src.indexOf(start);
const ei = src.indexOf(end, si);

if (si === -1 || ei === -1) {
  console.error('shell block not found', si, ei);
  process.exit(1);
}

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

src = src.slice(0, si) + replacement + src.slice(ei + end.length);
fs.writeFileSync(twmPath, src);
console.log('workspace shell replaced');