# UI Specification

## Purpose

Defines the frontend requirements for the Engram (Knowledge Graph) UI in DevHub, specifically the `Cerebro.jsx` view and its integration into the app.

## Requirements

### Requirement: Cerebro Route

The system MUST expose a new route `/project/:projectId/cerebro` for the Engram view.

#### Scenario: Navigate to Cerebro

- GIVEN a user is in a project workspace
- WHEN they navigate to `/project/:projectId/cerebro`
- THEN the `Cerebro.jsx` view is rendered

### Requirement: Sidebar Navigation

The system MUST display a "Cerebro / Engram" button in the `WorkspaceSidebar.jsx`.

#### Scenario: Click Sidebar Item

- GIVEN the workspace sidebar is visible
- WHEN the user clicks the "Cerebro / Engram" button
- THEN the application navigates to the Cerebro route

### Requirement: Display Memories

The system MUST fetch and display memories from the local DevHub Node.js sidecar via HTTP requests, NOT directly from the database.

#### Scenario: Successful Memory Fetch

- GIVEN the Cerebro view is mounted
- WHEN the frontend requests memories from the sidecar API
- THEN it displays the memories as categorized cards (decision, bugfix, architecture)

#### Scenario: Loading State

- GIVEN the Cerebro view is mounted
- WHEN the request to the sidecar API is pending
- THEN the UI displays a skeleton loader or spinner

#### Scenario: Error State

- GIVEN the Cerebro view is mounted
- WHEN the request to the sidecar API fails (e.g., Engram MCP server is down)
- THEN the UI displays a friendly error state indicating the service is unavailable

### Requirement: Search and Filter

The system SHOULD provide an input to search and filter memories.

#### Scenario: Filter Memories

- GIVEN the Cerebro view has loaded memories
- WHEN the user enters a search term
- THEN the UI updates to show only memories matching the search term

---

# Sidecar API Specification

## Purpose

Defines the backend requirements for the DevHub Node.js sidecar acting as an MCP client to the Engram server.

## Requirements

### Requirement: Engram MCP Bridge

The system MUST provide HTTP endpoints in the sidecar to bridge requests from the frontend to the Engram MCP server.

#### Scenario: Fetch Memories via MCP

- GIVEN the sidecar receives a request to list memories
- WHEN it communicates with the Engram MCP server
- THEN it returns the MCP response to the frontend

#### Scenario: MCP Server Unavailable

- GIVEN the sidecar receives a request
- WHEN the Engram MCP server is not running or unreachable
- THEN the sidecar returns an appropriate HTTP error status to the frontend
