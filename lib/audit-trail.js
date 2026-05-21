/**
 * AuditTrail — Execution audit trail for AgentHub sessions.
 *
 * Records every step of an agent's execution and generates
 * visual reports to detect anomalies (unexpected pauses, timeouts, errors).
 *
 * Usage:
 *   const trail = new AuditTrail(sessionID, { prompt, agent, project_id });
 *   trail.record('server_start', { status: 'starting' });
 *   trail.record('session_create', { sessionID: 'abc-123' });
 *   trail.record('prompt_sent', { length: 150 });
 *   trail.record('tool_call', { tool: 'read', file: 'src/index.js' });
 *   trail.record('tool_complete', { tool: 'read', duration: 230 });
 *   trail.record('session_idle', { duration: 45000 });
 *   const report = trail.generateReport();
 *   console.log(report);
 */

const fs = require('fs');
const path = require('path');

// ── Constants ───────────────────────────────────────────────────────────────

const AUDIT_DIR = path.join(process.cwd(), 'data', 'audit-trails');
const MAX_TRAILS = 100; // Keep last 100 trails

// ── Colors ──────────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  magenta: '\x1b[35m',
};

function color(str, c) {
  return `${C[c] || ''}${str}${C.reset}`;
}

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ── Anomaly Detection ───────────────────────────────────────────────────────

const ANOMALY_RULES = {
  // Gap between events > 30s without a "waiting" or "idle" event
  LONG_GAP: { threshold: 30000, label: 'Long gap between events' },
  // Tool call that takes > 60s
  SLOW_TOOL: { threshold: 60000, label: 'Slow tool execution' },
  // Session idle without completion
  UNEXPECTED_IDLE: { threshold: 120000, label: 'Unexpected idle (possible pause)' },
  // Error events
  ANY_ERROR: { threshold: 0, label: 'Error detected' },
  // No tool calls at all
  NO_TOOLS: { threshold: 0, label: 'No tool calls detected' },
  // Session never reaches idle/completed state
  NO_COMPLETION: { threshold: 0, label: 'Session never completed' },
};

function detectAnomalies(entries) {
  const anomalies = [];

  if (entries.length === 0) {
    anomalies.push({ type: 'NO_EVENTS', severity: 'critical', message: 'No events recorded' });
    return anomalies;
  }

  // Check for long gaps between events
  for (let i = 1; i < entries.length; i++) {
    const gap = entries[i].timestamp - entries[i - 1].timestamp;
    if (gap > ANOMALY_RULES.LONG_GAP.threshold) {
      const prevEvent = entries[i - 1].type;
      const currEvent = entries[i].type;
      // Don't flag gaps after waiting/idle events
      if (!['session_waiting', 'session_idle', 'tool_waiting'].includes(prevEvent)) {
        anomalies.push({
          type: 'LONG_GAP',
          severity: 'warning',
          message: `${ANOMALY_RULES.LONG_GAP.label}: ${formatDuration(gap)} between "${prevEvent}" and "${currEvent}"`,
          timestamp: entries[i].timestamp,
        });
      }
    }
  }

  // Check for slow tool calls
  const toolCalls = entries.filter((e) => e.type === 'tool_call');
  const toolCompletes = entries.filter((e) => e.type === 'tool_complete');

  for (const tc of toolCalls) {
    const complete = toolCompletes.find(
      (t) => t.data?.tool === tc.data?.tool && t.timestamp > tc.timestamp
    );
    if (complete) {
      const duration = complete.timestamp - tc.timestamp;
      if (duration > ANOMALY_RULES.SLOW_TOOL.threshold) {
        anomalies.push({
          type: 'SLOW_TOOL',
          severity: 'warning',
          message: `${ANOMALY_RULES.SLOW_TOOL.label}: "${tc.data.tool}" took ${formatDuration(duration)}`,
          timestamp: tc.timestamp,
        });
      }
    }
  }

  // Check for no tool calls
  if (toolCalls.length === 0) {
    const hasText = entries.some((e) => e.type === 'text_response');
    if (!hasText) {
      anomalies.push({
        type: 'NO_TOOLS',
        severity: 'warning',
        message: ANOMALY_RULES.NO_TOOLS.label,
      });
    }
  }

  // Check for errors
  const errors = entries.filter((e) => e.type === 'error' || e.type === 'session_error');
  for (const err of errors) {
    anomalies.push({
      type: 'ANY_ERROR',
      severity: 'error',
      message: `${ANOMALY_RULES.ANY_ERROR.label}: ${err.data?.message || err.data?.error || 'Unknown error'}`,
      timestamp: err.timestamp,
    });
  }

  // Check for no completion
  const hasCompletion = entries.some(
    (e) => e.type === 'session_idle' || e.type === 'session_completed' || e.type === 'session_error'
  );
  if (!hasCompletion) {
    anomalies.push({
      type: 'NO_COMPLETION',
      severity: 'warning',
      message: ANOMALY_RULES.NO_COMPLETION.label,
    });
  }

  // Check for unexpected idle (session idle with very few tool calls)
  const idleEvents = entries.filter((e) => e.type === 'session_idle');
  for (const idle of idleEvents) {
    if (toolCalls.length <= 1 && idle.data?.duration > ANOMALY_RULES.UNEXPECTED_IDLE.threshold) {
      anomalies.push({
        type: 'UNEXPECTED_IDLE',
        severity: 'warning',
        message: `${ANOMALY_RULES.UNEXPECTED_IDLE.label}: session idled after only ${toolCalls.length} tool call(s)`,
        timestamp: idle.timestamp,
      });
    }
  }

  return anomalies;
}

// ── AuditTrail Class ────────────────────────────────────────────────────────

class AuditTrail {
  /**
   * @param {string} sessionID - Session identifier
   * @param {object} metadata - Session metadata
   * @param {string} metadata.prompt - Original prompt
   * @param {string} [metadata.agent] - Agent name
   * @param {string} [metadata.project_id] - Project ID
   * @param {string} [metadata.directory] - Working directory
   */
  constructor(sessionID, metadata = {}) {
    this.sessionID = sessionID;
    this.metadata = {
      prompt: metadata.prompt || '',
      agent: metadata.agent || 'default',
      project_id: metadata.project_id || 'default',
      directory: metadata.directory || process.cwd(),
      startedAt: Date.now(),
    };
    this.entries = [];
    this._toolStarts = new Map(); // Track tool call start times
    this._completed = false;
  }

  /**
   * Record an event.
   *
   * @param {string} type - Event type
   * @param {object} [data] - Event data
   */
  record(type, data = {}) {
    const entry = {
      type,
      data,
      timestamp: Date.now(),
      timeStr: timestamp(),
    };
    this.entries.push(entry);

    // Track tool call durations
    if (type === 'tool_call' && data.tool) {
      this._toolStarts.set(data.tool, Date.now());
    } else if (type === 'tool_complete' && data.tool) {
      const startTime = this._toolStarts.get(data.tool);
      if (startTime) {
        data.duration = Date.now() - startTime;
        this._toolStarts.delete(data.tool);
      }
    }

    // Mark completion
    if (['session_idle', 'session_completed', 'session_error'].includes(type)) {
      this._completed = true;
      this.metadata.completedAt = Date.now();
      this.metadata.duration = this.metadata.completedAt - this.metadata.startedAt;
    }

    // Persist to file
    this._persist();

    return entry;
  }

  /**
   * Persist the audit trail to disk.
   */
  _persist() {
    try {
      if (!fs.existsSync(AUDIT_DIR)) {
        fs.mkdirSync(AUDIT_DIR, { recursive: true });
      }

      const trailData = {
        sessionID: this.sessionID,
        metadata: this.metadata,
        entries: this.entries,
        anomalies: detectAnomalies(this.entries),
        completed: this._completed,
      };

      const filePath = path.join(AUDIT_DIR, `${this.sessionID}.json`);
      fs.writeFileSync(filePath, JSON.stringify(trailData, null, 2), 'utf-8');

      // Cleanup old trails
      this._cleanupOldTrails();
    } catch (err) {
      console.error(`[audit] Failed to persist trail for ${this.sessionID}:`, err.message);
    }
  }

  /**
   * Clean up old audit trails, keeping only the most recent MAX_TRAILS.
   */
  _cleanupOldTrails() {
    try {
      if (!fs.existsSync(AUDIT_DIR)) return;

      const files = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.json'));
      if (files.length <= MAX_TRAILS) return;

      const sorted = files
        .map((f) => ({
          name: f,
          mtime: fs.statSync(path.join(AUDIT_DIR, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      for (let i = MAX_TRAILS; i < sorted.length; i++) {
        fs.unlinkSync(path.join(AUDIT_DIR, sorted[i].name));
      }
    } catch (err) {
      // Silent cleanup failure
    }
  }

  /**
   * Generate a visual report of the audit trail.
   *
   * @returns {string} Formatted report string
   */
  generateReport() {
    const lines = [];
    const { metadata, entries } = this;
    const duration = metadata.completedAt
      ? metadata.completedAt - metadata.startedAt
      : Date.now() - metadata.startedAt;
    const anomalies = detectAnomalies(entries);

    // ── Header ──
    lines.push('');
    lines.push(color('═══════════════════════════════════════════════════════════', 'bold'));
    lines.push(color('  📋 AgentHub Execution Audit Report', 'bold'));
    lines.push(color('═══════════════════════════════════════════════════════════', 'bold'));
    lines.push('');

    // ── Session Info ──
    lines.push(color('  Session:', 'cyan'), this.sessionID);
    lines.push(color('  Agent:', 'cyan'), metadata.agent);
    lines.push(color('  Project:', 'cyan'), metadata.project_id);
    lines.push(color('  Directory:', 'cyan'), metadata.directory);
    lines.push(color('  Started:', 'cyan'), new Date(metadata.startedAt).toLocaleString());
    lines.push(color('  Duration:', 'cyan'), formatDuration(duration));
    lines.push('');

    // ── Prompt ──
    const promptPreview =
      metadata.prompt.length > 100 ? metadata.prompt.slice(0, 100) + '...' : metadata.prompt;
    lines.push(color('  Prompt:', 'cyan'), `"${promptPreview}"`);
    lines.push('');

    // ── Timeline ──
    lines.push(color('  ── Execution Timeline ──', 'dim'));
    lines.push('');

    let lastTimestamp = metadata.startedAt;

    for (const entry of entries) {
      const gap = entry.timestamp - lastTimestamp;
      const gapStr = gap > 1000 ? color(` (+${formatDuration(gap)})`, 'yellow') : '';

      switch (entry.type) {
        case 'server_start':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 🚀 Server starting${gapStr}`
          );
          break;

        case 'server_ready':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} ✅ Server ready (port ${entry.data?.port || '?'})${gapStr}`
          );
          break;

        case 'server_failed':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} ❌ Server failed: ${entry.data?.error || 'Unknown'}${gapStr}`
          );
          break;

        case 'session_create':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 📝 Session created${gapStr}`
          );
          break;

        case 'prompt_sent':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 📤 Prompt sent (${entry.data?.length || 0} chars)${gapStr}`
          );
          break;

        case 'tool_call':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 🔧 Tool: ${color(entry.data?.tool || '?', 'magenta')} ${entry.data?.file ? `→ ${entry.data.file}` : ''}${gapStr}`
          );
          break;

        case 'tool_complete':
          const dur = entry.data?.duration ? ` (${formatDuration(entry.data.duration)})` : '';
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')}   ✅ ${entry.data?.tool || '?'} completed${dur}${gapStr}`
          );
          break;

        case 'tool_error':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')}   ❌ ${entry.data?.tool || '?'} failed: ${entry.data?.error || 'Unknown'}${gapStr}`
          );
          break;

        case 'text_response':
          const textPreview = (entry.data?.text || '').slice(0, 80);
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 💬 Response: "${textPreview}"${gapStr}`
          );
          break;

        case 'reasoning':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 🧠 Reasoning...${gapStr}`
          );
          break;

        case 'subtask_start':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 🔄 Subtask: ${entry.data?.agent || '?'} → ${entry.data?.prompt?.slice(0, 50) || '?'}${gapStr}`
          );
          break;

        case 'session_waiting':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} ⏳ Waiting...${gapStr}`
          );
          break;

        case 'session_idle':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} ⏸️  Session idle${gapStr}`
          );
          break;

        case 'session_completed':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} ✅ Session completed${gapStr}`
          );
          break;

        case 'session_error':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} ❌ Session error: ${entry.data?.error || 'Unknown'}${gapStr}`
          );
          break;

        case 'error':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} ❌ Error: ${entry.data?.message || entry.data?.error || 'Unknown'}${gapStr}`
          );
          break;

        case 'sse_connected':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 📡 SSE connected${gapStr}`
          );
          break;

        case 'sse_disconnected':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 🔌 SSE disconnected${gapStr}`
          );
          break;

        case 'trace_persisted':
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} 💾 Trace persisted (${entry.data?.count || 0} total)${gapStr}`
          );
          break;

        default:
          lines.push(
            `  ${color('[', 'dim')}${entry.timeStr}${color(']', 'dim')} ${entry.type}${gapStr}`
          );
      }

      lastTimestamp = entry.timestamp;
    }

    // ── Summary ──
    lines.push('');
    lines.push(color('  ── Summary ──', 'dim'));
    lines.push('');

    const toolCalls = entries.filter((e) => e.type === 'tool_call').length;
    const toolErrors = entries.filter((e) => e.type === 'tool_error').length;
    const textResponses = entries.filter((e) => e.type === 'text_response').length;
    const errors = entries.filter((e) => e.type === 'error' || e.type === 'session_error').length;

    lines.push(`  ${color('Tool calls:', 'cyan')} ${toolCalls}`);
    lines.push(
      `  ${color('Tool errors:', 'cyan')} ${toolErrors > 0 ? color(toolErrors.toString(), 'red') : '0'}`
    );
    lines.push(`  ${color('Text responses:', 'cyan')} ${textResponses}`);
    lines.push(
      `  ${color('Errors:', 'cyan')} ${errors > 0 ? color(errors.toString(), 'red') : '0'}`
    );
    lines.push(`  ${color('Total events:', 'cyan')} ${entries.length}`);
    lines.push('');

    // ── Anomalies ──
    if (anomalies.length > 0) {
      lines.push(color('  ── Anomalies Detected ──', 'yellow'));
      lines.push('');

      for (const anomaly of anomalies) {
        const icon =
          anomaly.severity === 'error'
            ? color('❌', 'red')
            : anomaly.severity === 'critical'
              ? color('🔴', 'red')
              : color('⚠️', 'yellow');

        lines.push(
          `  ${icon} ${color(anomaly.message, anomaly.severity === 'error' ? 'red' : 'yellow')}`
        );
      }

      lines.push('');
    } else {
      lines.push(color('  ── Anomalies: None ✅ ──', 'green'));
      lines.push('');
    }

    // ── Status ──
    const statusIcon = this._completed
      ? errors > 0
        ? color('❌ COMPLETED WITH ERRORS', 'red')
        : color('✅ COMPLETED SUCCESSFULLY', 'green')
      : color('⏳ STILL RUNNING', 'yellow');

    lines.push(color('  ── Status ──', 'dim'));
    lines.push(`  ${statusIcon}`);
    lines.push('');
    lines.push(color('═══════════════════════════════════════════════════════════', 'bold'));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Get the raw audit trail data.
   * @returns {object}
   */
  toJSON() {
    return {
      sessionID: this.sessionID,
      metadata: this.metadata,
      entries: this.entries,
      anomalies: detectAnomalies(this.entries),
      completed: this._completed,
    };
  }
}

// ── Static Methods ──────────────────────────────────────────────────────────

/**
 * Load an audit trail from disk.
 *
 * @param {string} sessionID
 * @returns {AuditTrail|null}
 */
AuditTrail.load = function (sessionID) {
  try {
    const filePath = path.join(AUDIT_DIR, `${sessionID}.json`);
    if (!fs.existsSync(filePath)) return null;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const trail = new AuditTrail(sessionID, data.metadata);
    trail.entries = data.entries || [];
    trail._completed = data.completed || false;
    return trail;
  } catch (err) {
    console.error(`[audit] Failed to load trail for ${sessionID}:`, err.message);
    return null;
  }
};

/**
 * List all audit trails.
 *
 * @returns {Array<{sessionID: string, metadata: object, completed: boolean, anomalies: number}>}
 */
AuditTrail.list = function () {
  try {
    if (!fs.existsSync(AUDIT_DIR)) return [];

    return fs
      .readdirSync(AUDIT_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, f), 'utf-8'));
          return {
            sessionID: data.sessionID,
            metadata: data.metadata,
            completed: data.completed,
            anomalies: (data.anomalies || []).length,
            startedAt: data.metadata?.startedAt,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  } catch {
    return [];
  }
};

/**
 * Print a summary of all audit trails.
 *
 * @returns {string}
 */
AuditTrail.printSummary = function () {
  const trails = AuditTrail.list();

  if (trails.length === 0) {
    return color('\n📋 No audit trails found.\n', 'dim');
  }

  const lines = [];
  lines.push('');
  lines.push(color('═══════════════════════════════════════════════════════════', 'bold'));
  lines.push(color('  📋 Audit Trail Summary', 'bold'));
  lines.push(color('═══════════════════════════════════════════════════════════', 'bold'));
  lines.push('');

  for (const trail of trails) {
    const status = trail.completed ? color('✅', 'green') : color('⏳', 'yellow');
    const anomalyCount = trail.anomalies > 0 ? color(` (${trail.anomalies} ⚠️)`, 'yellow') : '';
    const prompt = trail.metadata?.prompt?.slice(0, 60) || '';
    const started = trail.startedAt ? new Date(trail.startedAt).toLocaleString() : '?';

    lines.push(`  ${status} ${trail.sessionID.slice(0, 12)}... ${anomalyCount}`);
    lines.push(`     "${prompt}"`);
    lines.push(`     ${started}`);
    lines.push('');
  }

  lines.push(color(`  Total: ${trails.length} trails`, 'dim'));
  lines.push('');

  return lines.join('\n');
};

/**
 * Print a full report for a specific session.
 *
 * @param {string} sessionID
 * @returns {string}
 */
AuditTrail.printReport = function (sessionID) {
  const trail = AuditTrail.load(sessionID);
  if (!trail) {
    return color(`\n❌ Audit trail not found: ${sessionID}\n`, 'red');
  }
  return trail.generateReport();
};

module.exports = { AuditTrail };
