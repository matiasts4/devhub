# Workspace Editor Dock Specification

## Purpose

Define stable per-workspace editor and preview behavior in the right dock, plus discoverable file navigation context, without expanding scope into terminal session restore.

## Requirements

### Requirement: Per-Workspace Dock Continuity

The system MUST preserve right-dock browser and editor context per workspace. Switching to another workspace MUST NOT unnecessarily remount the inactive workspace's editor state or reload its preview state. Returning to a workspace SHALL restore its last dock tab, selected file, file view mode, and preview URL/history unless the user explicitly refreshed or navigated.

#### Scenario: Returning to an editor workspace restores context

- GIVEN workspace A has the editor dock open with a selected file and workspace B becomes active
- WHEN the user switches back to workspace A
- THEN workspace A restores the same editor tab and current file context without resetting to an empty selection

#### Scenario: Preview does not reload on workspace switch alone

- GIVEN workspace A has a loaded browser preview and the user switches to workspace B
- WHEN the user later returns to workspace A without pressing reload or changing URL
- THEN the preview remains on the same location and is not reloaded solely because of the workspace switch

### Requirement: Editor File Tree Search

The system MUST provide file-tree search inside the editor dock. Search SHOULD narrow visible results using file and path text, and selecting a result SHALL open that file in the current workspace context.

#### Scenario: Search narrows visible files

- GIVEN the editor tree contains multiple files and folders
- WHEN the user enters a search query
- THEN the tree shows matching files or ancestor paths needed to understand the match location

#### Scenario: Search selection opens file

- GIVEN a search result is visible in the editor dock
- WHEN the user selects that result
- THEN the matching file becomes the current file in the editor area for that workspace

### Requirement: Explicit Tree And Context Affordances

The system MUST make folder expansion state and editor context easy to perceive. Folder rows SHALL expose an explicit expand/collapse affordance distinct from file selection, and the dock header SHOULD show the current workspace directory and current file path with truncation-safe visibility.

#### Scenario: Folder affordance is explicit

- GIVEN a directory row is rendered in the file tree
- WHEN the user inspects or targets that row
- THEN the UI exposes a clear expand/collapse control instead of relying only on ambiguous row clicks

#### Scenario: Current directory and file remain visible

- GIVEN a workspace has a known project path and a file is selected
- WHEN the editor dock header renders in normal or constrained width
- THEN the current directory and current file context remain visible in a readable truncated or wrapped form

### Requirement: Scope Boundary

This change MUST remain limited to right-dock stability and editor discoverability. It MUST NOT add or modify terminal session restore behavior, persisted reopen flows, or durable session semantics.

#### Scenario: Session restore remains unchanged

- GIVEN existing terminal session reopen and restore flows
- WHEN this change ships
- THEN those flows behave as before and no new dependency on dock stability is introduced
