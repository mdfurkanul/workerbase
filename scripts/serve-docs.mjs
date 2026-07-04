// ───────────────────────────────────────────────────────────────────────────
// ⚠️  DEV-ONLY — DO NOT IMPORT FROM BACKEND.
// This script is a local docs viewer for developers. It is NOT part of the
// Worker bundle (wrangler.jsonc `main` = backend/src/index.ts), will never
// run in production, and is excluded from `npm run build` / `deploy:*`.
// Safe to delete without affecting the deployed app.
// ───────────────────────────────────────────────────────────────────────────
// Serves <repo>/docs on http://localhost:6789 (or next free port).
// Usage:  npm run docs        # serve
//         npm run docs:open   # serve + open browser
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const PORT = Number(process.env.PORT) || 6789;
const SHOULD_OPEN = process.argv.includes('--open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

function log(req, status) {
  console.log(`  ${String(status).padEnd(3)}  ${req.method.padEnd(4)}  ${req.url}`);
}

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    if (urlPath === '/') urlPath = '/index.html';

    // Expose API.md at both /API.md and /docs/API.md so the explorer can fetch it
    // from whichever base path it's served at.
    const filePath = path.join(DOCS_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    const exists = await fs.stat(filePath).then(s => s.isFile()).catch(() => false);
    if (!exists) {
      log(req, 404);
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    log(req, 200);
    res.end(body);
  } catch (err) {
    log(req, 500);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(err));
  }
});

function startServer(port) {
  const s = server;
  s.listen(port);

  s.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < PORT + 20) {
      // Try the next port — avoids confusing crashes when a stale
      // docs server is still running.
      startServer(port + 1);
    } else {
      console.error(`\n  ✖  Could not start server: ${err.message}\n`);
      process.exit(1);
    }
  });

  s.on('listening', async () => {
    const actualPort = s.address().port;
    const url = `http://localhost:${actualPort}/`;
    console.log('\n  📡  WorkerBase API Explorer');
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  Serving  ${DOCS_DIR}`);
    if (actualPort !== PORT) {
      console.log(`  Note     port ${PORT} was busy → using ${actualPort}`);
    }
    console.log(`  Open     ${url}\n`);
    console.log('  Requests:');

    if (SHOULD_OPEN) {
      const cmd = process.platform === 'darwin' ? 'open'
                : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
    }
  });
}

startServer(PORT);
