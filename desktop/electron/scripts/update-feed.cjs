'use strict';

/**
 * Local update feed for electron-updater (generic provider).
 *
 * Serves dist/electron/ under http://127.0.0.1:<port>/devhub/ so a packaged
 * DevHub install can discover and download updates without any external host.
 *
 * Usage:
 *   pnpm electron:feed                  # port 9100
 *   DEVHUB_FEED_PORT=9200 pnpm electron:feed
 *
 * The feed URL baked into the installer is http://127.0.0.1:9100/devhub
 * (see electron-builder.yml `publish`); point DEVHUB_UPDATE_URL at this
 * server to override at runtime.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const DIST_DIR = path.join(repoRoot, 'dist', 'electron');
const PORT = Number(process.env.DEVHUB_FEED_PORT || 9100);
const MOUNT = '/devhub';

const CONTENT_TYPES = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
  '.msi': 'application/octet-stream',
  '.zip': 'application/zip',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'method not allowed');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'bad request');
  }

  if (!pathname.startsWith(`${MOUNT}/`)) {
    return send(res, 404, `not found — feed is mounted under ${MOUNT}/\n`);
  }

  const rel = pathname.slice(MOUNT.length + 1);
  const filePath = path.normalize(path.join(DIST_DIR, rel));

  // Path traversal guard: resolved path must stay inside DIST_DIR.
  if (!filePath.startsWith(DIST_DIR + path.sep)) {
    return send(res, 403, 'forbidden');
  }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      return send(res, 404, 'not found');
    }
    const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[DevHub Feed] serving ${DIST_DIR}`);
  console.log(`[DevHub Feed] URL: http://127.0.0.1:${PORT}${MOUNT}/`);
  for (const artifact of ['latest.yml', 'latest-beta.yml']) {
    const p = path.join(DIST_DIR, artifact);
    console.log(`[DevHub Feed] ${artifact}: ${fs.existsSync(p) ? 'OK' : 'missing (run pnpm electron:build)'}`);
  }
  const exes = fs.existsSync(DIST_DIR)
    ? fs.readdirSync(DIST_DIR).filter((f) => f.endsWith('.exe') || f.endsWith('.blockmap'))
    : [];
  for (const f of exes) console.log(`[DevHub Feed] artifact: ${f}`);
});
