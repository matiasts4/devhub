# Delta: terminal-workspace-window-mount

## Requirements

### TWM-1 Parked window mount parity
- GIVEN workspace with windows V1 and V2 and V1 active
- WHEN user selects V2
- THEN terminals in V1 remain mounted under `workspace-window-parked-v1` with layout visibility false
- AND terminals in V2 become layout-visible without requiring a new mount if they were previously shown in the session

### TWM-2 Lifecycle parity
- GIVEN single-panel active window
- WHEN user switches workspace window
- THEN lifecycle behavior matches workspace tab switch (no extra `devhub:terminal-layout-settled` burst beyond multi-panel post-split)

### TWM-3 Pizarra view switch
- GIVEN pizarra maximized with multiple workspace windows
- WHEN user completes a view switch to another window
- THEN `onWorkspaceWindowSelect` updates active window without `pizarra-view-switch` layout-settled burst