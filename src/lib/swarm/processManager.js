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

const { spawn } = require('child_process');
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

const SERVER_PORT = process.env.OPENCODE_PORT ? parseInt(process.env.OPENCODE_PORT, 10) : 4153;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const PID_FILE = path.join(process.cwd(), 'data', '.opencode.pid');

class ProcessManager {
  constructor() {
    this.serverProcess = null;
    this.serverReady = false;
    this.launchPromise = null;
    this.activeSessions = new Map(); // sessionId -> { startTime, agent, project }
    this.processId = null; // DB tracking ID for swarm_processes
    this._signalHandlersRegistered = false;
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
      return { pid: this.serverProcess.pid, port: SERVER_PORT };
    }
    if (this.launchPromise) return this.launchPromise;

    // Try to adopt existing process first
    if (await this.adoptExisting()) {
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
      return { pid: null, port: SERVER_PORT };
    }

    this.launchPromise = this.spawnServer(cwd);
    const ok = await this.launchPromise;
    this.launchPromise = null;
    if (!ok) throw new Error('Failed to start OpenCode serve');
    return { pid: this.serverProcess?.pid || this.readPidFile(), port: SERVER_PORT };
  }

  /**
   * Spawn the OpenCode server
   */
  async spawnServer(cwd) {
    console.log('[ProcessManager] Spawning opencode serve...');

    return new Promise((resolve) => {
      const workingDir = cwd || process.cwd();
      this.serverProcess = spawn('opencode', ['serve', '--port', String(SERVER_PORT)], {
        cwd: workingDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });

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
            resolve(true);
          }
        }
      });

      this.serverProcess.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) console.debug(`[opencode stderr] ${msg}`);
      });

      this.serverProcess.on('error', (err) => {
        console.error('[ProcessManager] OpenCode spawn error:', err.message);
        this.serverProcess = null;
        this.serverReady = false;
        this.launchPromise = null;
        if (this.processId) {
          updateSwarmProcess(this.processId, { status: 'error' });
        }
        resolve(false);
      });

      this.serverProcess.on('exit', (code, signal) => {
        console.warn(`[ProcessManager] OpenCode exited (code=${code}, signal=${signal})`);
        this.serverProcess = null;
        this.serverReady = false;
        this.launchPromise = null;
        this.removePidFile();
        if (this.processId) {
          updateSwarmProcess(this.processId, { status: 'stopped' });
        }
      });

      // Timeout fallback
      setTimeout(async () => {
        if (!ready) {
          const healthy = await this.healthCheck();
          if (healthy) {
            this.serverReady = true;
            updateSwarmProcess(this.processId, { status: 'running' });
            resolve(true);
          } else {
            console.warn('[ProcessManager] Server startup timeout, assuming ready');
            this.serverReady = true;
            updateSwarmProcess(this.processId, { status: 'running' });
            resolve(true);
          }
        }
      }, 15000);
    });
  }

  /**
   * Graceful shutdown: dispose + SIGTERM + SIGKILL fallback
   */
  async shutdown() {
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
}

// Singleton instance
const instance = new ProcessManager();
module.exports = instance;
