import net from 'net';
import os from 'os';

// Use global require via eval to bypass Webpack's statically analyzed requires
// This guarantees that the native .node addons for 'node-pty' and 'ws' load correctly 
// instead of getting stubbed or mangled by Next.js's dev compiler.
const pty = eval('require')('node-pty');
const { WebSocketServer } = eval('require')('ws');

const GLOBAL_TTY_KEY = '__DEVHUB_TTY_SERVER__';

function resolveShell() {
  if (process.env.SHELL) return process.env.SHELL;
  return os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh';
}

function resolveHomeDirectory() {
  return process.env.HOME || process.cwd();
}

function pickFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (err) => reject(err));
    server.once('listening', () => {
      const addr = server.address();
      server.close(() => resolve(addr.port));
    });

    server.listen(startPort, '127.0.0.1');
  });
}

async function findAvailablePort(basePort = 4077, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = basePort + offset;
    try {
      const port = await pickFreePort(candidate);
      return port;
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('No available port found for PTY websocket server.');
}

function parseClientMessage(rawMessage) {
  try {
    return JSON.parse(rawMessage.toString());
  } catch {
    return null;
  }
}

export async function ensureTTYServer() {
  if (globalThis[GLOBAL_TTY_KEY]) {
    return globalThis[GLOBAL_TTY_KEY];
  }

  const basePort = Number(process.env.DEVHUB_TTY_PORT || 4077);
  const wsPath = '/terminal';
  const port = await findAvailablePort(basePort);
  const wss = new WebSocketServer({ host: '127.0.0.1', port, path: wsPath });

  wss.on('connection', (socket, request) => {
    let cwd = resolveHomeDirectory();
    try {
      if (request?.url) {
        // e.g. /terminal?cwd=/home/matias
        const dummyUrl = new URL(request.url, 'http://localhost');
        const requestedCwd = dummyUrl.searchParams.get('cwd');
        if (requestedCwd) cwd = requestedCwd;
      }
    } catch (e) { console.error('Error parsing WS URL:', e); }

    const shell = resolveShell();

    const env = Object.assign({}, process.env, {
      DEVHUB_PROJECT_DIR: cwd,
      DEVHUB_MCP_CMD: 'node /home/matias/devhub/devhub-mcp/server.js',
      // Optional: Add alias logic if shell allows or hint the user
      GEMINI_MCP_HINT: 'Use DEVHUB_MCP_CMD to connect Gemini CLI to your local server.'
    });

    const terminal = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 32,
      cwd,
      env,
    });

    terminal.onData((chunk) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'output', data: chunk }));
      }
    });

    terminal.onExit(({ exitCode, signal }) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'exit', exitCode, signal }));
        socket.close();
      }
    });

    socket.on('message', (rawMessage) => {
      const message = parseClientMessage(rawMessage);
      if (!message?.type) return;

      if (message.type === 'input' && typeof message.data === 'string') {
        terminal.write(message.data);
      }

      if (
        message.type === 'resize' &&
        Number.isInteger(message.cols) &&
        Number.isInteger(message.rows) &&
        message.cols > 0 &&
        message.rows > 0
      ) {
        terminal.resize(message.cols, message.rows);
      }
    });

    socket.on('close', () => {
      terminal.kill();
    });

    socket.send(JSON.stringify({ type: 'ready' }));
  });

  const serverState = { port, wsPath };
  globalThis[GLOBAL_TTY_KEY] = serverState;
  return serverState;
}
