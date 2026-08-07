/**
 * Browser matrix for the built verifier application.
 *
 * Drives the production build through Chromium, Firefox and WebKit, plus mobile emulation
 * profiles, and asserts per engine: the verification flow contract, deterministic report
 * output, input-snapshot behavior under asynchronous reads, the file-input path, the
 * capability error path, zero network requests caused by verification, zero persistence
 * attempts and zero residual persistence (localStorage, sessionStorage, IndexedDB,
 * CacheStorage, service workers), and no application console errors. The served bundles are
 * scanned for dynamic code evaluation, which the application must not contain.
 *
 * Playwright is never a repository dependency. Provide an external installation:
 *
 *   mkdir -p /tmp/peac-browser-deps && cd /tmp/peac-browser-deps
 *   pnpm init && pnpm add playwright@<exact-stable>
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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const APP_ROOT = resolve(dirname(SELF), '..', '..');
const DIST = resolve(APP_ROOT, 'dist');

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
  '  pnpm init && pnpm add playwright@<exact-stable>\n' +
  '  pnpm exec playwright install chromium firefox webkit\n' +
  'then pass --deps /tmp/peac-browser-deps';

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('run-browser-matrix: apps/verifier/dist is absent; build the app first:');
  console.error('  pnpm --filter @peac/app-verifier build');
  process.exit(2);
}

let playwright;
let playwrightVersion = 'unknown';
try {
  const specifier = depsRoot
    ? pathToFileURL(join(resolve(depsRoot), 'node_modules', 'playwright', 'index.js')).href
    : 'playwright';
  const pw = await import(specifier);
  playwright = pw.default ?? pw;
  const manifest = depsRoot
    ? join(resolve(depsRoot), 'node_modules', 'playwright', 'package.json')
    : fileURLToPath(import.meta.resolve('playwright/package.json'));
  playwrightVersion = JSON.parse(readFileSync(manifest, 'utf8')).version;
} catch (err) {
  console.error(`run-browser-matrix: ${err.message}\n\n${SETUP}`);
  process.exit(2);
}
console.log(`playwright ${playwrightVersion} on node ${process.version}`);

const { generateKeypair, base64urlEncode, base64urlDecode, computeJwkThumbprint } =
  await import('@peac/crypto');
const { issue } = await import('@peac/protocol');

// The application must not evaluate dynamic code; verified against the exact bundles served.
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

// Firefox reports Playwright's own injected evaluation as a page CSP violation. The bundle scan
// above proves the application ships no dynamic code, so exactly this diagnostic, in Firefox
// only, is classified as an automation diagnostic; every other console error fails the run.
const FIREFOX_AUTOMATION_DIAGNOSTIC =
  /Content-Security-Policy.*blocked a JavaScript eval.*script-src/;

const LIMITS = { record: 64 * 1024, key: 128 * 1024, context: 8 * 1024 };

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

  // Tamper by flipping one decoded payload byte and re-encoding, keeping the signature, so the
  // signed bytes provably change.
  const segments = issued.jws.split('.');
  const payloadBytes = base64urlDecode(segments[1]);
  const tamperedBytes = Uint8Array.from(payloadBytes);
  tamperedBytes[0] ^= 0x01;
  if (Buffer.from(payloadBytes).equals(Buffer.from(tamperedBytes))) {
    throw new Error('tamper fixture failed to change the signed bytes');
  }
  const tampered = [segments[0], base64urlEncode(tamperedBytes), segments[2]].join('.');

  return {
    record: issued.jws,
    unicodeRecord: unicodeIssued.jws,
    tampered,
    bareJwk: JSON.stringify(jwk),
    jwks: JSON.stringify({ keys: [otherJwk, jwk] }),
    unicodeJwks: JSON.stringify({ keys: [otherJwk, unicodeJwk] }),
    wrongKey: JSON.stringify(otherJwk),
    malformedKey: '{ not json',
    oversizedRecord: 'a'.repeat(LIMITS.record + 1),
    oversizedKey: 'a'.repeat(LIMITS.key + 1),
    oversizedContext: 'a'.repeat(LIMITS.context + 1),
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
    { id: 'oversized-key', record: f.record, key: f.oversizedKey, heading: REJECT },
    {
      id: 'oversized-context',
      record: f.record,
      key: f.bareJwk,
      context: f.oversizedContext,
      heading: REJECT,
    },
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
    const file = resolve(DIST, path === '' ? 'index.html' : path);
    const contained = !relative(DIST, file).startsWith('..');
    if (!contained || !existsSync(file) || !statSync(file).isFile()) {
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

// Counts persistence ATTEMPTS from before application code runs; the observers never mutate the
// surfaces they watch.
const PERSISTENCE_OBSERVER = () => {
  const counts = {
    storageWrites: 0,
    indexedDbOpens: 0,
    cacheOpens: 0,
    serviceWorkerRegistrations: 0,
  };
  Object.defineProperty(globalThis, '__peacPersistenceAttempts', { value: counts });
  const wrap = (object, method, key) => {
    if (!object || typeof object[method] !== 'function') return;
    const original = object[method];
    object[method] = function (...a) {
      counts[key] += 1;
      return original.apply(this, a);
    };
  };
  wrap(Storage.prototype, 'setItem', 'storageWrites');
  wrap(globalThis.indexedDB, 'open', 'indexedDbOpens');
  if (globalThis.caches) wrap(globalThis.caches, 'open', 'cacheOpens');
  if (navigator.serviceWorker) {
    wrap(navigator.serviceWorker, 'register', 'serviceWorkerRegistrations');
  }
};

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

async function reportJson(page) {
  const pre = page.locator('section pre').first();
  await pre.waitFor({ state: 'visible', timeout: 15000 });
  return pre.textContent();
}

// Identical inputs must produce a byte-identical report, including its hash. The evaluation
// time is a declared report input, so equality is asserted on a pair of runs that share it.
async function checkDeterministicReport(page, flow, problems) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await runFlow(page, flow);
    const first = await reportJson(page);
    await runFlow(page, flow);
    const second = await reportJson(page);
    const a = JSON.parse(first);
    const b = JSON.parse(second);
    if (a.evaluationTimeUnixSeconds !== b.evaluationTimeUnixSeconds) continue;
    if (first !== second) {
      problems.push('determinism: identical inputs and evaluation time produced different reports');
    }
    if (!a.reportSha256 || a.reportSha256 !== b.reportSha256) {
      problems.push('determinism: report hashes differ for identical inputs');
    }
    for (const key of Object.keys(a)) {
      if (/userAgent|platform|locale|path|random/i.test(key)) {
        problems.push(`determinism: environment-shaped field "${key}" in the report core`);
      }
    }
    return;
  }
  problems.push('determinism: could not obtain two runs sharing an evaluation second');
}

// A pending asynchronous file read must not replace newer manual input.
async function checkReadSupersession(page, fixtures, problems) {
  const fileInput = page.locator('input[type=file]').first();
  await fileInput.setInputFiles({
    name: 'record.jws',
    mimeType: 'application/jose',
    buffer: Buffer.from(fixtures.tampered),
  });
  await page.fill('#record', fixtures.record);
  await page.waitForTimeout(250);
  const value = await page.inputValue('#record');
  if (value !== fixtures.record) {
    problems.push('supersession: an asynchronous file read replaced newer manual input');
  }
}

// The file controls must feed the same verification path as pasted input.
async function checkFileInput(page, fixtures, problems) {
  await page.fill('#record', '');
  await page.fill('#key', '');
  await page.fill('#context', '');
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'record.jws',
      mimeType: 'application/jose',
      buffer: Buffer.from(fixtures.record),
    });
  await page.fill('#key', fixtures.bareJwk);
  await page.waitForSelector('button:enabled', { timeout: 15000 });
  await page.click('button:has-text("Verify")');
  const heading = page.locator('section h2').first();
  await heading.waitFor({ state: 'visible', timeout: 15000 });
  const text = await heading.textContent();
  if (text !== ACCEPT) problems.push(`file-input: expected "${ACCEPT}", saw "${text}"`);
}

async function runSession(engineName, page, fixtures, origin, flowIds) {
  const problems = [];
  const consoleErrors = [];
  let automationDiagnostics = 0;
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (engineName === 'firefox' && FIREFOX_AUTOMATION_DIAGNOSTIC.test(m.text())) {
      automationDiagnostics += 1;
      return;
    }
    consoleErrors.push(m.text());
  });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(PERSISTENCE_OBSERVER);

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
    await checkDeterministicReport(page, flows(fixtures)[0], problems);

    await page.fill('#record', fixtures.record + ' ');
    const headings = await page.locator('section h2').count();
    if (headings !== 0)
      problems.push('input-snapshot: an edited input left a stale result visible');

    await checkReadSupersession(page, fixtures, problems);
    await checkFileInput(page, fixtures, problems);
  }

  if (requests.length !== requestsAfterLoad) {
    problems.push(
      `verification caused ${requests.length - requestsAfterLoad} network request(s): ` +
        requests.slice(requestsAfterLoad).join(', ')
    );
  }

  const attempts = await page.evaluate(() => globalThis.__peacPersistenceAttempts);
  for (const [surface, count] of Object.entries(attempts ?? {})) {
    if (count !== 0) problems.push(`persistence attempt: ${surface} = ${count}`);
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
  return { problems, automationDiagnostics };
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
    const session = await runSession(name, await context.newPage(), fixtures, origin);
    const problems = [...session.problems, ...(await runCapabilityCheck(browser, origin))];
    const version = browser.version();
    await browser.close();
    const diag = session.automationDiagnostics
      ? `, ${session.automationDiagnostics} automation diagnostic(s) classified`
      : '';
    report(
      name,
      problems,
      `${version}; ${flows(fixtures).length} flows + report determinism + snapshot + ` +
        `supersession + file input + capability; no network, no persistence attempts${diag}`
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
      const session = await runSession(
        m.engine,
        await context.newPage(),
        fixtures,
        origin,
        MOBILE_FLOW_IDS
      );
      await browser.close();
      report(m.label, session.problems, MOBILE_FLOW_IDS.join(', '));
    }
  }
} finally {
  server.close();
}
process.exit(failed ? 1 : 0);
