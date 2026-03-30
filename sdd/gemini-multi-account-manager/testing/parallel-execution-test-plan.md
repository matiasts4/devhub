# Parallel Execution Test Plan for Multi-Account Feature

## Objective

Ensure that the `OpenCode` engine and any associated spawned processes use the correct, isolated `GEMINI_CLI_HOME` for each unique profile. Specifically, when multiple agents are launched concurrently using different profiles, they must not share the same state, tokens, or configuration.

## Pre-requisites

- Two distinct profiles created (e.g., `account_A` and `account_B`).
- Each profile has its own `GEMINI_CLI_HOME` directory generated inside `~/.gemini-profiles/`.

## Test Scenarios

### Scenario 1: Basic Isolation Verification

1. Call `launchAgent` with `profileName: 'account_A'`.
2. Inspect the spawned Node.js child process environment variables.
3. Assert that `GEMINI_CLI_HOME` matches the absolute path to `~/.gemini-profiles/account_A`.
4. Call `launchAgent` with `profileName: 'account_B'`.
5. Assert that `GEMINI_CLI_HOME` matches `~/.gemini-profiles/account_B`.

### Scenario 2: Concurrent Execution without Cross-Contamination

1. Concurrently trigger `launchAgent` for `account_A` and `account_B`.
   ```js
   Promise.all([
     launchAgent({ profileName: 'account_A', ...otherProps }),
     launchAgent({ profileName: 'account_B', ...otherProps }),
   ]);
   ```
2. Monitor the file system activities in `~/.gemini-profiles/account_A` and `~/.gemini-profiles/account_B`.
3. Assert that files (such as `oauth_creds.json` or engine logs) are created strictly in their respective directories.
4. Verify via process listing (e.g., `ps -ef`) that two separate processes are running with their distinct `GEMINI_CLI_HOME` values.

### Scenario 3: Fallback / Default Behavior

1. Trigger `launchAgent` without providing a `profileName` (if permitted) or with a "default" profile.
2. Verify that it either cleanly throws an error requiring a profile or falls back to a safe default path (`~/.gemini`), depending on design specifications.
3. Assert that `sanitizeProfileName` correctly prevents any malicious profiles from breaking out of the `PROFILES_DIR`.
