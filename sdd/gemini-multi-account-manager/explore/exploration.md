## Exploration: Gemini Multi-Account Manager

### Current State

The user leverages multiple Google AI Pro accounts (~5) to avoid exhausting quotas during heavy agentic tasks in the Node.js/Next.js DevHub environment. Currently, switching between these accounts is likely a manual process. The DevHub environment is using `@google/gemini-cli` which manages its authentication locally without native built-in multi-profile switching capabilities (i.e., there is no `gemini auth login --profile <name>` out of the box).

### Affected Areas

- `~/.gemini/oauth_creds.json` — This file stores the OAuth2 credentials (access token, refresh token, id token, etc.) for the currently active account.
- `~/.gemini/google_accounts.json` — This file tracks the active account email as well as an array of previously used (`old`) account emails.
- **Agent Launcher UI / Next.js DevHub App** — Will need a new UI component to list available accounts, display their quota, and provide a 1-click switch.
- **Node.js Backend** — Needs to interact with the file system to swap out the credentials and fetch quotas.

### Findings on Investigation

1. **How the Gemini CLI stores authentication tokens locally:**
   The CLI stores the OAuth tokens in `~/.gemini/oauth_creds.json`. This file contains the active `access_token`, `refresh_token`, `id_token`, and `expiry_date`. A companion file, `~/.gemini/google_accounts.json`, maintains a JSON object with `"active": "email@example.com"` and an `"old": [...]` array of other known accounts.

2. **Swapping Authentication State:**
   The CLI has no native `--profile` command. However, we have two excellent ways to swap states:
   - **Method A (File Swapping):** Simply replace the contents of `~/.gemini/oauth_creds.json` and update `"active"` in `~/.gemini/google_accounts.json` with the desired account. The CLI will pick it up on the next run.
   - **Method B (Environment Variables):** The CLI respects the `GEMINI_CLI_HOME` environment variable, which overrides the location of the `.gemini` folder. We could maintain a folder per account (e.g., `~/.gemini_profiles/account1`, `~/.gemini_profiles/account2`) and just spawn tasks with `GEMINI_CLI_HOME=/home/user/.gemini_profiles/account1`.

3. **Tracking Quota per Account:**
   The CLI environment currently exposes a mechanism to check quotas (e.g., the `gemini_quota` tool logic or API endpoint). The quota returns a breakdown of remaining percentages per model (e.g., Gemini 3.1 Pro: 50.7%, resets in 23h 36m).
   - In our Node.js environment, we can iterate over all known profiles by setting the `GEMINI_CLI_HOME` (or swapping the auth file temporarily), executing the quota check, and caching the result.
   - This cached data can be sent to the Next.js frontend to render a "Accounts & Quotas" dashboard in the Agent Launcher UI, displaying progress bars and reset times for each account.

### Approaches

1. **Profile Folders with `GEMINI_CLI_HOME` Environment Variable**
   - **Description:** Create an isolated `.gemini` directory for each account (e.g., `~/.gemini-profiles/account1/.gemini`). The DevHub UI sets `GEMINI_CLI_HOME` before launching agents.
   - **Pros:** Completely isolated states, zero risk of race conditions if two agents run concurrently with different accounts. Clean, native-supported override.
   - **Cons:** Requires modifying agent execution code to inject the environment variable.
   - **Effort:** Medium

2. **Credential File Swapping in `~/.gemini`**
   - **Description:** Maintain a database (or a set of JSON files) with credentials for each account. When the user clicks "Switch Account" in the UI, the backend overwrites `~/.gemini/oauth_creds.json` globally.
   - **Pros:** Very simple to implement. Agents don't need any environment variables injected; they just use the default path.
   - **Cons:** Risk of race conditions if multiple background tasks spawn simultaneously, as they share the same global state.
   - **Effort:** Low

### Recommendation

**Approach 1: Profile Folders with `GEMINI_CLI_HOME`** is highly recommended. Because the DevHub executes agents that might run in parallel or in the background, relying on a global `~/.gemini/oauth_creds.json` state introduces race conditions. By storing a unique profile path and injecting `GEMINI_CLI_HOME`, we ensure concurrency safety. For the UI, a background CRON job in the Node.js backend can cycle through the profiles every few minutes, run the quota check, and broadcast the stats via WebSocket or make them available via REST for the Next.js UI to consume.

### Risks

- **Token Expiry:** Refresh tokens may expire or be revoked by Google if unused for a long time, requiring the user to re-authenticate manually for that profile.
- **Rate Limits:** Fetching quotas for all 5 accounts too aggressively might hit Google Cloud API rate limits.
- **Schema Changes:** If `@google/gemini-cli` changes its directory structure or environment variables (e.g., ignoring `GEMINI_CLI_HOME`), the system would break.

### Ready for Proposal

Yes. The orchestrator should tell the user that the exploration confirms that managing multiple accounts is fully possible by leveraging the `GEMINI_CLI_HOME` environment variable to maintain separate state directories for each account. We can build a Next.js UI dashboard to track and switch these profiles gracefully.
