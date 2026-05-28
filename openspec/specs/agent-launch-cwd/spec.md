# Agent Launch CWD Specification

## Purpose

Ensure swarm agents always start in the correct worktree directory by enforcing explicit CWD in both the agent wrapper script and the tmux session, failing fast if the directory doesn't exist.

## Requirements

### REQ-CWD-1: Explicit cd in Agent Wrapper

The system MUST insert `cd "${workspacePath}"` as the first executable command in the generated agent launch wrapper script, before environment exports and identity verification. If the target directory does not exist, the script MUST exit immediately with a non-zero code and an error message.

#### Scenario: Wrapper includes cd command

- GIVEN a workspace path of `/home/user/project/.worktrees/feature-a`
- WHEN `buildAgentLaunchWrapper()` generates the script
- THEN the script's first executable line after the shebang is `cd "/home/user/project/.worktrees/feature-a"`
- AND the cd command appears before any env exports or identity checks

#### Scenario: Worktree directory does not exist

- GIVEN a workspace path of `/home/user/project/.worktrees/nonexistent`
- WHEN the generated script runs and the directory does not exist
- THEN the script exits with code 1
- AND the error message includes the missing path

### REQ-CWD-2: Tmux Session CWD Flag

The system MUST pass the workspace path as the working directory for the tmux session via the `-c` flag on `new-session`. This provides defense-in-depth: even if the inner command changes directory, the tmux session starts in the correct directory.

#### Scenario: Tmux command includes -c flag

- GIVEN an inner command and a workspace path of `/home/user/project/.worktrees/feature-a`
- WHEN `buildTmuxWrappedCommand(innerCommand, sessionName, cwd)` is called
- THEN the tmux `new-session` command includes `-c "/home/user/project/.worktrees/feature-a"`

#### Scenario: Default cwd when not specified

- GIVEN `buildTmuxWrappedCommand(innerCommand, sessionName)` is called without a `cwd` argument
- THEN the tmux `new-session` command omits the `-c` flag
- AND the session uses the default working directory

### REQ-CWD-3: Fail-Fast on Missing Worktree

The system MUST validate that the worktree path exists before launching the agent. If the path does not exist on disk, the launch MUST fail with a clear error rather than starting in an incorrect directory.

#### Scenario: Launch aborted for missing worktree

- GIVEN a workspace with `worktree_path` set to a directory that does not exist
- WHEN the agent launch is initiated
- THEN the launch fails before the agent process starts
- AND the error message indicates the worktree path does not exist

#### Scenario: Launch succeeds for valid worktree

- GIVEN a workspace with `worktree_path` set to an existing directory
- WHEN the agent launch is initiated
- THEN the agent process starts in the correct directory
- AND the CWD matches the `worktree_path`
