/**
 * The browser-matrix static server: assets load once into an immutable map, symbolic links are
 * rejected, and requests are answered without touching the filesystem.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error plain module without type declarations
import { loadAssets, respond } from './browser/static-assets.mjs';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'peac-static-'));
  writeFileSync(join(root, 'index.html'), '<p>index</p>');
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets', 'app.js'), 'export {};');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

interface Served {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}

function serve(assets: Map<string, unknown>, url: string): Served {
  const out: Served = { status: 0 };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      out.status = status;
      out.headers = headers;
      return this;
    },
    end(body?: Buffer) {
      if (body) out.body = body.toString();
    },
  };
  respond(assets, url, res);
  return out;
}

describe('the in-memory static server', () => {
  it('serves the index for the root path', () => {
    const assets = loadAssets(root);
    const served = serve(assets, '/');
    expect(served.status).toBe(200);
    expect(served.body).toBe('<p>index</p>');
  });

  it('serves an asset with its content type', () => {
    const assets = loadAssets(root);
    const served = serve(assets, '/assets/app.js');
    expect(served.status).toBe(200);
    expect(served.headers?.['content-type']).toContain('text/javascript');
    expect(served.body).toBe('export {};');
  });

  it('returns 404 for an unknown path', () => {
    expect(serve(loadAssets(root), '/absent.js').status).toBe(404);
  });

  it('traversal input cannot escape the asset namespace', () => {
    const assets = loadAssets(root);
    const bodies = new Set(
      [...assets.values()].map((a) => (a as { body: Buffer }).body.toString())
    );
    // URL normalization may resolve dotted segments to a legitimate asset; anything served must
    // be a member of the loaded namespace, and unresolvable traversal must 404.
    for (const url of ['/../index.html', '/assets/../index.html']) {
      const served = serve(assets, url);
      expect(served.status === 404 || bodies.has(served.body ?? ''), url).toBe(true);
    }
    for (const url of ['/..%2F..%2Fetc%2Fhosts', '/%2e%2e/%2e%2e/etc/hosts', '/etc/hosts']) {
      expect(serve(assets, url).status, url).toBe(404);
    }
  });

  it('malformed URL encoding fails closed', () => {
    expect(serve(loadAssets(root), '/%zz').status).toBe(404);
  });

  it('rejects symbolic links at load', () => {
    const linked = mkdtempSync(join(tmpdir(), 'peac-static-link-'));
    try {
      writeFileSync(join(linked, 'index.html'), 'x');
      symlinkSync(join(root, 'index.html'), join(linked, 'escape.html'));
      expect(() => loadAssets(linked)).toThrow(/symbolic link/);
    } finally {
      rmSync(linked, { recursive: true, force: true });
    }
  });
});
