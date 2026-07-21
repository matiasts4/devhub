/* global process, fetch, AbortSignal */
// installed by DevHub — managed block, do not edit (version marker DEVHUB_HOOKS_VERSION=1)


const SOURCE = "devhub:opencode";
const AGENT = "opencode";
let reportSeq = Date.now() * 1000;

// Subagent (task tool) sessions carry a parentID; the main agent session does
// not. Their lifecycle events would otherwise clobber the pane's real state, so
// learn child session ids from session.created/updated and drop their reports.
const childSessions = new Set();

function nextReportSeq() {
  reportSeq += 1;
  return reportSeq;
}

function sessionIDFromProperties(properties) {
  return typeof properties?.sessionID === "string" && properties.sessionID
    ? properties.sessionID
    : undefined;
}

function stateFromSessionStatus(status) {
  const kind = typeof status === "string" ? status : status?.type;
  if (typeof kind !== "string") return undefined;
  switch (kind.toLowerCase()) {
    case "idle":
      return "idle";
    case "active":
    case "busy":
    case "pending":
    case "running":
    case "streaming":
    case "working":
    case "retry":
      return "working";
    default:
      return undefined;
  }
}

async function postReport(state, event, agentSessionId) {
  const hookUrl = process.env.DEVHUB_HOOK_URL;
  const terminalId = process.env.DEVHUB_TERMINAL_ID;
  const token = process.env.DEVHUB_HOOK_TOKEN;

  if (process.env.DEVHUB_HOOK_ENV !== "1" || !hookUrl || !terminalId || !token) {
    return;
  }

  const payload = {
    terminalId,
    token,
    source: SOURCE,
    agent: AGENT,
    state,
    event: event || state,
    agentSessionId: agentSessionId || null,
    seq: nextReportSeq(),
    ts: Date.now(),
  };

  try {
    await fetch(hookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(1000),
    });
  } catch {
    // Fail silently so OpenCode is never interrupted
  }
}

export const DevHubAgentStatePlugin = async () => {
  if (
    process.env.DEVHUB_HOOK_ENV !== "1" ||
    !process.env.DEVHUB_HOOK_URL ||
    !process.env.DEVHUB_TERMINAL_ID ||
    !process.env.DEVHUB_HOOK_TOKEN
  ) {
    return {};
  }

  return {
    "chat.message": async ({ sessionID }) => {
      if (sessionID && childSessions.has(sessionID)) {
        return;
      }
      await postReport("working", "chat.message", sessionID);
    },
    event: async ({ event }) => {
      const type = event?.type;
      const properties = event?.properties ?? {};
      const sessionID = sessionIDFromProperties(properties);

      const info = properties.info;
      if (info?.id && info.parentID) {
        childSessions.add(info.id);
      }
      if (sessionID && childSessions.has(sessionID)) {
        switch (type) {
          case "permission.asked":
          case "question.asked":
            await postReport("blocked", type);
            break;
          case "permission.replied":
          case "question.replied":
          case "question.rejected":
            await postReport("working", type);
            break;
          default:
            break;
        }
        return;
      }

      switch (type) {
        case "session.created":
          await postReport("session", type, sessionID);
          break;
        case "session.updated":
          await postReport("session", type, sessionID);
          break;
        case "session.status": {
          const state = stateFromSessionStatus(properties.status);
          if (state) {
            await postReport(state, type, sessionID);
          } else {
            await postReport("session", type, sessionID);
          }
          break;
        }
        case "tool.execute.before":
        case "tool.execute.after":
        case "permission.replied":
        case "question.replied":
        case "question.rejected":
        case "session.compacted":
          await postReport("working", type, sessionID);
          break;
        case "permission.asked":
        case "question.asked":
        case "session.error":
          await postReport("blocked", type, sessionID);
          break;
        case "session.idle":
          await postReport("idle", type, sessionID);
          break;
        case "session.deleted":
          break;
        default:
          break;
      }
    },
  };
};
