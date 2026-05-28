/**
 * Swarm Process Manager
 * Singleton that manages the OpenCode server lifecycle with:
 * - PID lock file to prevent orphaned processes
 * - Process adoption on startup
 * - Graceful shutdown (dispose + SIGTERM + SIGKILL fallback)
 * - Health check integration
 * - Session tracking
 * - Orphan detection and cleanup
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  getSwarmConfig,
  getActiveSwarmCount,
  getSwarmProcesses,
  registerSwarmProcess,
  updateSwarmProcess,
  removeSwarmProcess,
} = require('@/lib/db/localDb.js');

const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4154;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const PID_FILE = path.join(process.cwd(), 'data', '.opencode_4154.pid');
const OPENCODE_ROOTS = [
  process.env.OPENCODE_WORKSPACE,
  path.resolve(process.cwd(), 'opencode'),
  path.resolve(__dirname, '../../../opencode'),
].filter(Boolean);

function isFile(file) {
  try {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function getOpenCode() {
  for (const root of OPENCODE_ROOTS) {
    const bin = path.join(root, 'packages', 'opencode', 'bin', 'opencode');
    if (isFile(bin)) {
      return { cmd: bin, args: ['serve', '--port', String(SERVER_PORT)], root };
    }
  }

  for (const root of OPENCODE_ROOTS) {
    const src = path.join(root, 'packages', 'opencode', 'src', 'index.ts');
    if (process.env.OPENCODE_USE_LOCAL_SOURCE === 'true' && isFile(src)) {
      const bun = (() => {
        try {
          return spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;
        } catch {
          return false;
        }
      })();

      if (bun) {
        return { cmd: 'bun', args: [src, 'serve', '--port', String(SERVER_PORT)], root };
      }
    }
  }

  return {
    error: [
      '[ProcessManager] Missing workspace-local OpenCode binary.',
      `Checked: ${OPENCODE_ROOTS.map((root) => path.join(root, 'packages', 'opencode', 'bin', 'opencode')).join(', ')}`,
      'Install the opencode workspace dependencies (including opencode-linux-x64) so the local wrapper exists.',
    ].join(' '),
  };
}

class ProcessManager {
  constructor() {
    this.serverProcess = null;
    this.serverReady = false;
    this.launchPromise = null;
    this.activeSessions = new Map(); // sessionId -> { startTime, agent, project }
    this.processId = null; // DB tracking ID for swarm_processes
    this._signalHandlersRegistered = false;
    this.lastSpawnError = null;

    // Supervisor Daemon state (SVD-1)
    this._supervisorInterval = null;
    this._supervisorIntervalMs = 0;
    this._supervisorLastTickAt = null;
    this._supervisorTickCount = 0;
    this._supervisorErrorCount = 0;
  }

  // ── Singleton Access ────────────────────────────────────────────

  static getInstance() {
    if (!ProcessManager._instance) {
      ProcessManager._instance = new ProcessManager();
    }
    return ProcessManager._instance;
  }

  // ── PID Lock File ───────────────────────────────────────────────

  /**
   * Check if a process is running by PID
   */
  isProcessRunning(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save PID to lock file
   */
  savePid(pid) {
    const dir = path.dirname(PID_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PID_FILE, String(pid));
  }

  /**
   * Read PID from lock file
   */
  readPidFile() {
    if (!fs.existsSync(PID_FILE)) return null;
    try {
      return parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
    } catch {
      return null;
    }
  }

  /**
   * Remove PID lock file
   */
  removePidFile() {
    try {
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } catch {
      // Ignore
    }
  }

  // ── Health Check ────────────────────────────────────────────────

  /**
   * Check health of the OpenCode server via /global/health
   */
  async healthCheck() {
    try {
      const res = await fetch(`${SERVER_URL}/global/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Process Adoption ────────────────────────────────────────────

  /**
   * Adopt existing process from PID file.
   * Returns true if successfully adopted.
   */
  async adoptExisting() {
    const pid = this.readPidFile();
    if (!pid) return false;

    try {
      if (this.isProcessRunning(pid)) {
        // Verify it's actually opencode by checking health
        const healthy = await this.healthCheck();
        if (healthy) {
          console.log(`[ProcessManager] Adopted existing opencode process (PID: ${pid})`);
          this.serverReady = true;
          // Register in DB if not already tracked
          const existing = getSwarmProcesses().find((p) => p.pid === pid && p.status === 'running');
          if (!existing) {
            this.processId = registerSwarmProcess({
              pid,
              port: SERVER_PORT,
              status: 'running',
              cwd: process.cwd(),
              metadata: { adopted: true },
            });
          }
          return true;
        }
      }
      // Stale PID file — process not running
      console.log(`[ProcessManager] Stale PID file (PID: ${pid}), cleaning up`);
      this.removePidFile();
      // Clean up DB entry
      const stale = getSwarmProcesses().find((p) => p.pid === pid);
      if (stale) {
        removeSwarmProcess(stale.id);
      }
    } catch (err) {
      console.error('[ProcessManager] Error adopting existing process:', err.message);
    }
    return false;
  }

  // ── Server Lifecycle ────────────────────────────────────────────

  /**
   * Ensure server is running (adopt or spawn). Idempotent.
   * Returns { pid, port } on success.
   */
  async ensure(cwd) {
    if (this.serverProcess && this.serverReady) {
      // Ensure supervisor daemon is running when server is already up
      this.startSupervisorDaemon();
      return { pid: this.serverProcess.pid, port: SERVER_PORT };
    }
    if (this.launchPromise) return this.launchPromise;

    try {
      await this.cleanupOrphans();
    } catch {
      // Non-fatal: continue startup even if cleanup fails
    }

    // Try to adopt existing process first
    if (await this.adoptExisting()) {
      // Start supervisor daemon after adopting existing process
      this.startSupervisorDaemon();
      return { pid: this.readPidFile(), port: SERVER_PORT };
    }

    // Check if already running (maybe from bot)
    if (await this.healthCheck()) {
      console.log('[ProcessManager] OpenCode already running (external), adopting');
      this.serverReady = true;
      this.processId = registerSwarmProcess({
        port: SERVER_PORT,
        status: 'running',
        cwd: cwd || process.cwd(),
        metadata: { adopted: true, source: 'health-check' },
      });
      // Start supervisor daemon after health-check adoption
      this.startSupervisorDaemon();
      return { pid: null, port: SERVER_PORT };
    }

    this.launchPromise = this.spawnServer(cwd);
    const ok = await this.launchPromise;
    this.launchPromise = null;
    if (!ok) throw new Error(this.lastSpawnError || 'Failed to start OpenCode serve');
    // Start supervisor daemon after fresh spawn
    this.startSupervisorDaemon();
    return { pid: this.serverProcess?.pid || this.readPidFile(), port: SERVER_PORT };
  }

  /**
   * Spawn the OpenCode server
   */
  async spawnServer(cwd) {
    console.log('[ProcessManager] Spawning opencode serve...');

    return new Promise((resolve) => {
      const workingDir = cwd || process.cwd();
      this.lastSpawnError = null;

      // Ensure logs directory exists
      const logDir = path.join(process.cwd(), 'data', 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

      const logFilePath = path.join(logDir, `opencode_${Date.now()}.log`);
      const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

      const finish = (ok) => {
        if (finish.done) return;
        finish.done = true;
        resolve(ok);
      };
      finish.done = false;

      // Prefer the workspace-local OpenCode binary when available.
      // This avoids depending on PATH, which may not include `opencode`.
      const local = getOpenCode();
      if (local.error) {
        this.lastSpawnError = local.error;
        logStream.write(`[${new Date().toISOString()}] ${local.error}\n`);
        logStream.end();
        this.launchPromise = null;
        resolve(false);
        return;
      }

      logStream.write(
        `[${new Date().toISOString()}] launch cmd=${local.cmd} args=${local.args.join(' ')} cwd=${workingDir} root=${local.root}\n`
      );

      this.serverProcess = spawn(local.cmd, local.args, {
        cwd: workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, BUN_CONFIG_VERBOSE: '0' },
      });

      // Pipe stdout and stderr to log file
      this.serverProcess.stdout.pipe(logStream);
      this.serverProcess.stderr.pipe(logStream);

      this.savePid(this.serverProcess.pid);

      // Register in DB
      this.processId = registerSwarmProcess({
        pid: this.serverProcess.pid,
        port: SERVER_PORT,
        status: 'starting',
        cwd: workingDir,
        metadata: { spawned: true },
      });

      let ready = false;

      this.serverProcess.stdout.on('data', (d) => {
        const msg = d.toString();
        if (msg.includes('listening on') || msg.includes('Server running')) {
          if (!ready) {
            ready = true;
            this.serverReady = true;
            updateSwarmProcess(this.processId, { status: 'running' });
            console.log(`[ProcessManager] OpenCode ready on port ${SERVER_PORT}`);
            finish(true);
          }
        }
      });

      this.serverProcess.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (!msg) return;
        this.lastSpawnError = msg;
        console.debug(`[opencode stderr] ${msg}`);
      });

      this.serverProcess.on('error', (err) => {
        console.error('[ProcessManager] OpenCode spawn error:', err.message);
        this.lastSpawnError = err.message;
        logStream.write(`[${new Date().toISOString()}] spawn_error=${err.message}\n`);
        logStream.end();
        this.serverProcess = null;
        this.serverReady = false;
        this.launchPromise = null;
        if (this.processId) {
          updateSwarmProcess(this.processId, { status: 'error' });
        }
        finish(false);
      });

      this.serverProcess.on('exit', (code, signal) => {
        console.warn(`[ProcessManager] OpenCode exited (code=${code}, signal=${signal})`);
        if (!ready) {
          const reason = `OpenCode exited before ready (code=${code}, signal=${signal})`;
          this.lastSpawnError = this.lastSpawnError || reason;
          logStream.write(`[${new Date().toISOString()}] ${reason}\n`);
        }
        logStream.end();
        this.serverProcess = null;
        this.serverReady = false;
        this.launchPromise = null;
        this.removePidFile();
        if (this.processId) {
          updateSwarmProcess(this.processId, { status: ready ? 'stopped' : 'error' });
        }
        if (!ready) finish(false);
      });

      // Timeout fallback
      setTimeout(async () => {
        if (!ready) {
          const healthy = await this.healthCheck();
          if (healthy) {
            this.serverReady = true;
            updateSwarmProcess(this.processId, { status: 'running' });
            finish(true);
          } else {
            const reason = 'Server startup timeout: health check failed';
            this.lastSpawnError = this.lastSpawnError || reason;
            console.warn(`[ProcessManager] ${reason}`);
            if (this.processId) {
              updateSwarmProcess(this.processId, { status: 'error' });
            }
            finish(false);
          }
        }
      }, 15000);
    });
  }

  /**
   * Graceful shutdown: dispose + SIGTERM + SIGKILL fallback
   */
  async shutdown() {
    // Stop supervisor daemon first
    this.stopSupervisorDaemon();

    if (!this.serverProcess && !this.serverReady) return;

    console.log('[ProcessManager] Shutting down OpenCode server...');

    // Try API dispose first
    try {
      await fetch(`${SERVER_URL}/global/dispose`, {
        method: 'POST',
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    } catch {
      // API might already be down
    }

    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');

      await new Promise((resolve) => {
        this.serverProcess.on('exit', resolve);
        setTimeout(() => {
          // Force kill if still running
          if (this.serverProcess) {
            try {
              this.serverProcess.kill('SIGKILL');
            } catch {
              // Already dead
            }
          }
          resolve();
        }, 3000);
      });
    }

    this.serverProcess = null;
    this.serverReady = false;
    this.launchPromise = null;
    this.activeSessions.clear();
    this.removePidFile();

    if (this.processId) {
      removeSwarmProcess(this.processId);
      this.processId = null;
    }

    console.log('[ProcessManager] OpenCode shutdown complete');
  }

  // ── Signal Handlers ─────────────────────────────────────────────

  /**
   * Register SIGTERM, SIGINT, and beforeExit handlers.
   * Safe to call multiple times (idempotent).
   */
  registerSignalHandlers() {
    if (this._signalHandlersRegistered) return;
    this._signalHandlersRegistered = true;

    const handler = async (signal) => {
      console.log(`[ProcessManager] Received ${signal}, shutting down...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGTERM', () => handler('SIGTERM'));
    process.on('SIGINT', () => handler('SIGINT'));
    process.on('beforeExit', async () => {
      await this.shutdown();
    });

    console.log('[ProcessManager] Signal handlers registered');
  }

  // ── Process Info ────────────────────────────────────────────────

  /**
   * Get process info (PID, memory, uptime)
   */
  getProcessInfo() {
    if (!this.serverProcess) return null;
    try {
      // Try to get memory usage from /proc on Linux
      let memoryMB = null;
      if (process.platform === 'linux' && this.serverProcess.pid) {
        try {
          const status = fs.readFileSync(`/proc/${this.serverProcess.pid}/status`, 'utf8');
          const match = status.match(/VmRSS:\s+(\d+)/);
          if (match) {
            memoryMB = Math.round(parseInt(match[1], 10) / 1024);
          }
        } catch {
          // /proc not accessible
        }
      }

      return {
        pid: this.serverProcess.pid,
        running: this.serverProcess.exitCode === null,
        ready: this.serverReady,
        spawnTime: this.serverProcess.spawnTime,
        uptime: this.serverProcess.spawnTime ? Date.now() - this.serverProcess.spawnTime : null,
        memoryMB,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get full status for the status API endpoint
   */
  async getStatus() {
    const healthy = await this.healthCheck();
    const info = this.getProcessInfo();
    const config = getSwarmConfig();
    const dbActiveCount = getActiveSwarmCount();

    return {
      running: healthy,
      healthy,
      pid: info?.pid || this.readPidFile(),
      port: SERVER_PORT,
      activeSessions: this.activeSessions.size,
      dbActiveCount,
      maxConcurrent: parseInt(config.max_concurrent, 10) || 5,
      swarmEnabled: config.swarm_enabled !== 'false',
      processInfo: info,
    };
  }

  // ── Session Tracking ────────────────────────────────────────────

  /**
   * Track an active session
   */
  trackSession(sessionId, metadata = {}) {
    this.activeSessions.set(sessionId, {
      ...metadata,
      startTime: Date.now(),
    });
  }

  /**
   * Untrack a completed session
   */
  untrackSession(sessionId) {
    this.activeSessions.delete(sessionId);
  }

  /**
   * Get active session count
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    const result = [];
    for (const [id, data] of this.activeSessions) {
      result.push({ id, ...data });
    }
    return result;
  }

  // ── Orphan Detection & Cleanup ──────────────────────────────────

  /**
   * Detect and clean up orphaned processes in DB
   */
  async cleanupOrphans() {
    const processes = getSwarmProcesses();
    const cleaned = [];

    for (const proc of processes) {
      if (proc.pid && !this.isProcessRunning(proc.pid)) {
        console.log(`[ProcessManager] Cleaning up orphaned process (PID: ${proc.pid})`);
        removeSwarmProcess(proc.id);
        cleaned.push(proc.id);
      }
    }

    // Also clean stale PID file if process is dead
    const pidFilePid = this.readPidFile();
    if (pidFilePid && !this.isProcessRunning(pidFilePid)) {
      this.removePidFile();
    }

    return cleaned;
  }

  // ── Concurrency Check ───────────────────────────────────────────

  /**
   * Check if we can spawn a new session based on concurrency limits
   */
  canSpawn() {
    const config = getSwarmConfig();
    const maxConcurrent = parseInt(config.max_concurrent, 10) || 5;
    const activeCount = this.getActiveSessionCount();
    return {
      allowed: activeCount < maxConcurrent,
      activeCount,
      maxConcurrent,
    };
  }

  // ── Supervisor Daemon ─────────────────────────────────────────

  /**
   * Start the supervisor daemon interval.
   *
   * Creates a setInterval that runs evaluateSupervisorTick on each tick.
   * If already running, returns the existing interval (no-op).
   * If SUPERVISOR_DAEMON_ENABLED is 'false', logs and returns null.
   *
   * @param {number} intervalMs — interval in milliseconds (default 30000)
   * @returns {NodeJS.Timeout|null} The interval timer, or null if disabled
   */
  startSupervisorDaemon(intervalMs = 30000) {
    const enabled = process.env.SUPERVISOR_DAEMON_ENABLED !== 'false';
    if (!enabled) {
      console.log('[ProcessManager] Supervisor daemon disabled by SUPERVISOR_DAEMON_ENABLED=false');
      return null;
    }

    if (this._supervisorInterval) {
      // Already running — no-op
      return this._supervisorInterval;
    }

    this._supervisorIntervalMs = intervalMs;

    const { evaluateSupervisorTick } = require('./supervisorDaemon');
    const { getDb } = require('../db/localDb');

    this._supervisorInterval = setInterval(() => {
      try {
        const db = getDb();
        if (db) {
          evaluateSupervisorTick(db);
          this._supervisorTickCount += 1;
          this._supervisorLastTickAt = new Date().toISOString();
        }
      } catch (e) {
        this._supervisorErrorCount += 1;
        console.error('[ProcessManager] Supervisor tick error:', e.message);
      }
    }, intervalMs);

    if (typeof this._supervisorInterval?.unref === 'function') {
      this._supervisorInterval.unref();
    }

    console.log(`[ProcessManager] Supervisor daemon started (interval: ${intervalMs}ms)`);
    return this._supervisorInterval;
  }

  /**
   * Stop the supervisor daemon interval.
   * Clears the interval and resets internal state.
   */
  stopSupervisorDaemon() {
    if (this._supervisorInterval) {
      clearInterval(this._supervisorInterval);
      console.log('[ProcessManager] Supervisor daemon stopped');
    }
    this._supervisorInterval = null;
    this._supervisorIntervalMs = 0;
    this._supervisorLastTickAt = null;
    this._supervisorTickCount = 0;
    this._supervisorErrorCount = 0;
  }

  /**
   * Get the current supervisor daemon status.
   * @returns {{ running: boolean, intervalMs: number, lastTickAt: string|null, tickCount: number, errors: number }}
   */
  getSupervisorStatus() {
    return {
      running: this._supervisorInterval !== null,
      intervalMs: this._supervisorIntervalMs || 0,
      lastTickAt: this._supervisorLastTickAt || null,
      tickCount: this._supervisorTickCount || 0,
      errors: this._supervisorErrorCount || 0,
    };
  }
}

// Singleton instance
const instance = new ProcessManager();
module.exports = instance;
