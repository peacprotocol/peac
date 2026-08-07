/**
 * Immutable in-memory static assets for the browser matrix.
 *
 * The built application is loaded once, before the test server starts; requests are answered
 * from the map with no request-time filesystem access, so no filesystem race or path ambiguity
 * exists at serving time. Symbolic links are rejected at load, regular files only are served,
 * and malformed URL encoding fails closed as a 404.
 */
import { createServer } from 'node:http';
import { closeSync, constants, fstatSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/**
 * Reads a directory tree into a Map of URL path to { body, type }. Symbolic links are rejected
 * atomically by opening with O_NOFOLLOW, and each file's type check and read share one
 * descriptor, so no check-then-use gap exists.
 */
export function loadAssets(root) {
  const assets = new Map();
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, `${prefix}${entry.name}/`);
        continue;
      }
      let fd;
      try {
        fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
      } catch (err) {
        if (err.code === 'ELOOP' || err.code === 'EMLINK') {
          throw new Error(`refusing symbolic link: ${prefix}${entry.name}`);
        }
        throw err;
      }
      try {
        if (!fstatSync(fd).isFile()) continue;
        assets.set(`/${prefix}${entry.name}`, {
          body: readFileSync(fd),
          type: MIME[extname(entry.name)] ?? 'application/octet-stream',
        });
      } finally {
        closeSync(fd);
      }
    }
  };
  walk(root, '');
  return assets;
}

/** Answers a request from the asset map. Returns the response that was served, for tests. */
export function respond(assets, url, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(404).end();
    return 404;
  }
  const asset = assets.get(pathname === '/' ? '/index.html' : pathname);
  if (!asset) {
    res.writeHead(404).end();
    return 404;
  }
  res.writeHead(200, { 'content-type': asset.type });
  res.end(asset.body);
  return 200;
}

/** Serves the asset map on a loopback origin. */
export function serveAssets(assets) {
  const server = createServer((req, res) => respond(assets, req.url, res));
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      resolveServer({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}
