#!/bin/sh
# installed by DevHub — managed block, do not edit (version marker DEVHUB_HOOKS_VERSION=1)
# usage: devhub-agent-state.sh <state> [event] [agent]
set -eu
[ "${DEVHUB_HOOK_ENV:-}" = "1" ] || exit 0
[ -n "${DEVHUB_HOOK_URL:-}" ] && [ -n "${DEVHUB_TERMINAL_ID:-}" ] && [ -n "${DEVHUB_HOOK_TOKEN:-}" ] || exit 0
state="${1:-}"; event="${2:-}"; agent="${3:-${DEVHUB_AGENT_NAME:-unknown}}"
case "$state" in working|blocked|idle|session) ;; *) exit 0 ;; esac
input="$(cat 2>/dev/null || true)"
agent_session_id="$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
seq="$(date +%s%N 2>/dev/null || date +%s000)"
ts="$(date +%s000 2>/dev/null || echo 0)"
payload="$(printf '{"terminalId":"%s","token":"%s","source":"devhub:%s","agent":"%s","state":"%s","event":"%s","agentSessionId":"%s","seq":%s,"ts":%s}' \
  "$DEVHUB_TERMINAL_ID" "$DEVHUB_HOOK_TOKEN" "$agent" "$agent" "$state" "$event" "$agent_session_id" "$seq" "$ts")"
curl -s -m 1 -o /dev/null -X POST -H 'Content-Type: application/json' --data "$payload" "$DEVHUB_HOOK_URL" 2>/dev/null || true
exit 0
