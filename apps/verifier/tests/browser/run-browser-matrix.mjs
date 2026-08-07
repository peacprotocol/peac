/**
 * Browser matrix for the built verifier application.
 *
 * Drives the production build through Chromium, Firefox and WebKit, plus mobile emulation
 * profiles, and asserts per engine: the verification flow contract, deterministic results,
 * input-snapshot binding, the capability error path, zero network requests caused by
 * verification, zero persistence (localStorage, sessionStorage, IndexedDB, CacheStorage,
 * service workers), and no console errors. The served bundles are also scanned for dynamic
 * code evaluation, which the application must not contain.
 *
 * Playwright is never a repository dependency. Provide an external installation:
 *
 *   mkdir -p /tmp/peac-browser-deps && cd /tmp/peac-browser-deps
 *   pnpm init && pnpm add playwright
 *   pnpm exec playwright install chromium firefox webkit
 *
 * Usage:
 *   pnpm --filter @peac/app-verifier build
 *   node apps/verifier/tests/browser/run-browser-matrix.mjs --deps /tmp/peac-browser-deps
 *     [--engines chromium,firefox,webkit] [--skip-mobile]
 *
 * Fixtures are issued per run with the real issuing API; no key material is committed.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const APP_ROOT = resolve(dirname(SELF), '..', '..');
const DIST = join(APP_ROOT, 'dist');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const depsRoot = opt('--deps', null);
const engines = opt('--engines', 'chromium,firefox,webkit')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);
const skipMobile = args.includes('--skip-mobile');

const SETUP =
  'external Playwright installation required:\n' +
  '  mkdir -p /tmp/peac-browser-deps && cd /tmp/peac-browser-deps\n' +
  '  pnpm init && pnpm add playwright\n' +
  '  pnpm exec playwright install chromium firefox webkit\n' +
  'then pass --deps /tmp/peac-browser-deps';

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('run-browser-matrix: apps/verifier/dist is absent; build the app first:');
  console.error('  pnpm --filter @peac/app-verifier build');
  process.exit(2);
}

let playwright;
try {
  const specifier = depsRoot
    ? pathToFileURL(join(resolve(depsRoot), 'node_modules', 'playwright', 'index.js')).href
    : 'playwright';
  const pw = await import(specifier);
  playwright = pw.default ?? pw;
} catch (err) {
  console.error(`run-browser-matrix: ${err.message}\n\n${SETUP}`);
  process.exit(2);
}

const { generateKeypair, base64urlEncode, computeJwkThumbprint } = await import('@peac/crypto');
const { issue } = await import('@peac/protocol');

// The application must not evaluate dynamic code; verified against the exact bundles served.
// Automation tooling injects its own evaluated scripts, so console messages reporting a blocked
// eval are excluded from the console-error assertion only because of this scan.
function scanBundles() {
  const problems = [];
  const assets = join(DIST, 'assets');
  for (const name of readdirSync(assets)) {
    if (!name.endsWith('.js')) continue;
    const text = readFileSync(join(assets, name), 'utf8');
    if (/\beval\s*\(/.test(text)) problems.push(`${name}: contains eval()`);
    if (/new Function/.test(text)) problems.push(`${name}: contains new Function`);
  }
  return problems;
}
const AUTOMATION_CONSOLE_PATTERN = /blocked a JavaScript eval/;

async function makeFixtures() {
  const kid = 'browser-matrix-k1';
  const unicodeKid = 'é'.repeat(127) + 'aa'; // 256 UTF-8 bytes exactly
  const { privateKey, publicKey } = await generateKeypair();
  const other = await generateKeypair();
  const base = {
    iss: 'https://issuer.example',
    kind: 'evidence',
    type: 'org.example/browser-matrix',
    occurred_at: '2026-04-01T00:00:00Z',
    purpose_declared: 'browser-matrix',
    pillars: ['safety'],
    privateKey,
  };
  const issued = await issue({ ...base, kid, jti: '01940000-0000-7000-8000-000000000002' });
  const unicodeIssued = await issue({
    ...base,
    kid: unicodeKid,
    jti: '01940000-0000-7000-8000-000000000003',
  });

  const x = base64urlEncode(publicKey);
  const jwk = { kty: 'OKP', crv: 'Ed25519', x, kid };
  const unicodeJwk = { kty: 'OKP', crv: 'Ed25519', x, kid: unicodeKid };
  const otherJwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64urlEncode(other.publicKey),
    kid: 'browser-matrix-k2',
  };
  const thumbprint = await computeJwkThumbprint({ kty: 'OKP', crv: 'Ed25519', x });
  const wrongThumbprint = await computeJwkThumbprint({
    kty: 'OKP',
    crv: 'Ed25519',
    x: otherJwk.x,
  });

  const segments = issued.jws.split('.');
  const payload = segments[1];
  const flipped = payload.slice(0, -1) + (payload.at(-1) === 'A' ? 'B' : 'A');

  return {
    record: issued.jws,
    unicodeRecord: unicodeIssued.jws,
    tampered: [segments[0], flipped, segments[2]].join('.'),
    oversizedRecord: 'a'.repeat(64 * 1024 + 1),
    bareJwk: JSON.stringify(jwk),
    jwks: JSON.stringify({ keys: [otherJwk, jwk] }),
    unicodeJwks: JSON.stringify({ keys: [otherJwk, unicodeJwk] }),
    wrongKey: JSON.stringify(otherJwk),
    malformedKey: '{ not json',
    trustMatch: JSON.stringify({
      contextVersion: '1',
      trust: { trustedJwkThumbprints: [thumbprint] },
    }),
    trustMismatch: JSON.stringify({
      contextVersion: '1',
      trust: { trustedJwkThumbprints: [wrongThumbprint] },
    }),
  };
}

const ACCEPT = 'Verification succeeded';
const REJECT = 'Verification failed';

function flows(f) {
  return [
    { id: 'accept-bare-jwk', record: f.record, key: f.bareJwk, heading: ACCEPT },
    { id: 'accept-jwks-selection', record: f.record, key: f.jwks, heading: ACCEPT },
    { id: 'accept-unicode-kid', record: f.unicodeRecord, key: f.unicodeJwks, heading: ACCEPT },
    {
      id: 'trusted-key-match',
      record: f.record,
      key: f.bareJwk,
      context: f.trustMatch,
      heading: ACCEPT,
    },
    { id: 'wrong-key', record: f.record, key: f.wrongKey, heading: REJECT, stage: 'signature' },
    { id: 'tamper', record: f.tampered, key: f.bareJwk, heading: REJECT, stage: 'signature' },
    { id: 'malformed-record', record: 'not-a-compact-jws', key: f.bareJwk, heading: REJECT },
    { id: 'malformed-key', record: f.record, key: f.malformedKey, heading: REJECT },
    { id: 'oversized-record', record: f.oversizedRecord, key: f.bareJwk, heading: REJECT },
    {
      id: 'trusted-key-mismatch',
      record: f.record,
      key: f.bareJwk,
      context: f.trustMismatch,
      heading: REJECT,
      stage: 'trusted_key',
    },
  ];
}
const MOBILE_FLOW_IDS = ['accept-bare-jwk', 'tamper'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function serveDist() {
  const server = createServer((req, res) => {
    const path = normalize(new URL(req.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    const file = join(DIST, path === '' ? 'index.html' : path);
    if (!file.startsWith(DIST) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      resolveServer({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function runFlow(page, flow) {
  await page.fill('#record', '');
  await page.fill('#record', flow.record);
  await page.fill('#key', '');
  await page.fill('#key', flow.key);
  await page.fill('#context', '');
  if (flow.context) await page.fill('#context', flow.context);
  await page.waitForSelector('button:enabled', { timeout: 15000 });
  await page.click('button:has-text("Verify")');
  const heading = page.locator('section h2').first();
  await heading.waitFor({ state: 'visible', timeout: 15000 });
  return {
    heading: await heading.textContent(),
    body: await page.locator('section').first().textContent(),
  };
}

async function assessmentText(page) {
  return page.locator('section dl').first().textContent();
}

async function runSession(page, fixtures, origin, flowIds) {
  const problems = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !AUTOMATION_CONSOLE_PATTERN.test(m.text())) {
      consoleErrors.push(m.text());
    }
  });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  const requestsAfterLoad = requests.length;
  for (const url of requests) {
    if (!url.startsWith(origin)) problems.push(`load requested a non-loopback URL: ${url}`);
  }

  const selected = flows(fixtures).filter((f) => !flowIds || flowIds.includes(f.id));
  for (const flow of selected) {
    const result = await runFlow(page, flow);
    if (result.heading !== flow.heading) {
      problems.push(`${flow.id}: expected "${flow.heading}", saw "${result.heading}"`);
      continue;
    }
    if (flow.stage && !result.body.includes(flow.stage)) {
      problems.push(`${flow.id}: expected failure stage "${flow.stage}" in the result`);
    }
  }

  if (!flowIds) {
    // Determinism: identical inputs render an identical assessment.
    const first = flows(fixtures)[0];
    await runFlow(page, first);
    const a = await assessmentText(page);
    await runFlow(page, first);
    const b = await assessmentText(page);
    if (a !== b) problems.push('determinism: two identical runs rendered different assessments');

    // Input-snapshot binding: editing an input clears the displayed result.
    await page.fill('#record', first.record + ' ');
    const headings = await page.locator('section h2').count();
    if (headings !== 0)
      problems.push('input-snapshot: an edited input left a stale result visible');
  }

  if (requests.length !== requestsAfterLoad) {
    problems.push(
      `verification caused ${requests.length - requestsAfterLoad} network request(s): ` +
        requests.slice(requestsAfterLoad).join(', ')
    );
  }

  const persistence = await page.evaluate(async () => ({
    localStorage: window.localStorage.length,
    sessionStorage: window.sessionStorage.length,
    indexedDb: 'databases' in indexedDB ? (await indexedDB.databases()).length : 0,
    caches: 'caches' in window ? (await caches.keys()).length : 0,
    serviceWorkers:
      'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
  }));
  for (const [surface, count] of Object.entries(persistence)) {
    if (count !== 0) problems.push(`persistence: ${surface} holds ${count} entr(ies)`);
  }
  for (const message of consoleErrors) problems.push(`console error: ${message}`);
  return problems;
}

// A runtime without WebCrypto Ed25519 must present a capability message, not a cryptic failure.
async function runCapabilityCheck(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined });
  });
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const problems = [];
  const body = await page.locator('body').textContent();
  if (!body.includes('This browser cannot perform the Ed25519 verification profile')) {
    problems.push('capability: no clear capability message for a runtime without WebCrypto');
  }
  const enabled = await page.locator('button:enabled').count();
  if (enabled !== 0) problems.push('capability: the verify control stayed enabled');
  await context.close();
  return problems;
}

const bundleProblems = scanBundles();
if (bundleProblems.length > 0) {
  for (const p of bundleProblems) console.error(`bundle: ${p}`);
  process.exit(1);
}

const fixtures = await makeFixtures();
const { server, origin } = await serveDist();
let failed = false;
const report = (name, problems, detail) => {
  if (problems.length === 0) {
    console.log(`${name}: OK${detail ? ` (${detail})` : ''}`);
  } else {
    failed = true;
    console.error(`${name}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
  }
};

try {
  for (const name of engines) {
    if (!playwright[name]) {
      console.error(`${name}: unknown engine`);
      failed = true;
      continue;
    }
    const browser = await playwright[name].launch();
    const context = await browser.newContext();
    const problems = await runSession(await context.newPage(), fixtures, origin);
    problems.push(...(await runCapabilityCheck(browser, origin)));
    await browser.close();
    report(
      name,
      problems,
      `${flows(fixtures).length} flows + determinism + snapshot + capability, no network, no persistence`
    );
  }

  if (!skipMobile) {
    const mobile = [
      { label: 'mobile-safari', engine: 'webkit', device: 'iPhone 14' },
      { label: 'mobile-chrome', engine: 'chromium', device: 'Pixel 7' },
    ];
    for (const m of mobile) {
      const device = playwright.devices[m.device];
      if (!device) {
        report(m.label, [`device profile "${m.device}" is not available`]);
        continue;
      }
      const browser = await playwright[m.engine].launch();
      const context = await browser.newContext({ ...device });
      const problems = await runSession(await context.newPage(), fixtures, origin, MOBILE_FLOW_IDS);
      await browser.close();
      report(m.label, problems, `${MOBILE_FLOW_IDS.join(', ')}`);
    }
  }
} finally {
  server.close();
}
process.exit(failed ? 1 : 0);
