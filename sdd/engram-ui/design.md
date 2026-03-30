# Design: Engram UI

## Technical Approach

We will create a new React view `src/views/Cerebro.jsx` to render the Engram UI and add it to the React Router configuration in `src/App.js`. The sidebar navigation will be updated in `src/components/WorkspaceSidebar.jsx`. For the backend sidecar, we will leverage Next.js API Routes by creating `src/app/api/engram/memories/route.js` to bridge requests to the local Engram MCP server.

## Architecture Decisions

### Decision: Routing Location

**Choice**: Add the Cerebro route to `react-router-dom` in `src/App.js` under the `/project/:projectId` layout.
**Alternatives considered**: Create a new Next.js App Router page (e.g., `app/project/[id]/cerebro/page.js`).
**Rationale**: The entire workspace UI is managed by `react-router-dom` inside an SPA shell. Adding it to `App.js` ensures seamless integration with the existing `WorkspaceLayout` and `WorkspaceSidebar` without full page reloads.

### Decision: API Sidecar Implementation

**Choice**: Use Next.js App Router (`src/app/api/engram/memories/route.js`) as the sidecar endpoint.
**Alternatives considered**: A standalone Express.js server.
**Rationale**: DevHub already uses `src/app/api/` for sidecar operations like local file system operations (`src/app/api/fs/`) and terminals. Keeping the bridge within Next.js API routes unifies the stack.

### Decision: Data Fetching

**Choice**: Standard React `useEffect` with `fetch` to `/api/engram/memories` and local component state.
**Alternatives considered**: Heavy state managers like Redux or React Query.
**Rationale**: The application handles other views gracefully with local state and React context. The Cerebro view just needs isolated fetching.

## Data Flow

    Cerebro.jsx ──(HTTP GET /api/engram/memories)──→ Next.js API Route
                                                             │
                                                       (MCP Protocol)
                                                             ↓
                                                     Engram MCP Server

## File Changes

| File                                   | Action | Description                                                                              |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `src/views/Cerebro.jsx`                | Create | The new Engram view rendering a search input and categorized memory cards.               |
| `src/App.js`                           | Modify | Import `Cerebro` and add `<Route path="cerebro" element={<Cerebro />} />` to the layout. |
| `src/components/WorkspaceSidebar.jsx`  | Modify | Add `cerebro` with a Brain/Network icon to `allNavItems` and `DEFAULT_NAV`.              |
| `src/app/api/engram/memories/route.js` | Create | Node.js API endpoint to bridge requests from the frontend to the Engram MCP server.      |

## Interfaces / Contracts

**Frontend to API Contract:**

```typescript
// GET /api/engram/memories?q={searchTerm}
interface MemoriesResponse {
  memories?: Array<{
    id: string;
    title: string;
    type: 'decision' | 'bugfix' | 'architecture' | 'discovery';
    content: string;
    created_at: string;
  }>;
  error?: string;
}
```

## Testing Strategy

| Layer       | What to Test | Approach                                                                                                                                    |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Cerebro.jsx  | Mock `fetch`, assert that cards, skeleton loader (when pending), and error states render correctly.                                         |
| Integration | API Route    | Mock the MCP connection response and verify the API returns HTTP 200 with the correct JSON array format, or HTTP 503 if MCP is unreachable. |

## Migration / Rollout

No database migration required. The local sidecar connects directly to the Engram MCP server dynamically.

## Open Questions

- [ ] What specific connection transport (stdio vs HTTP SSE) should the Next.js API route use to talk to the Engram MCP server?
