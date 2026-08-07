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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAssets, serveAssets } from './static-assets.mjs';

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

// Static scan of the served bundles. eval() and new Function() are forbidden outright. A bare
// Function() constructor is reported unless it is the one recognised dependency capability probe,
// which application-wide jitless configuration leaves unexecuted -- the runtime instrumentation
// below is what proves it never runs.
const CAPABILITY_PROBE =
  /includes\(\s*(["'`])Cloudflare\1\s*\)[^]{0,60}?Function\s*\(\s*(``|''|"")\s*\)/;

function scanBundles() {
  const problems = [];
  const assets = join(DIST, 'assets');
  let knownProbes = 0;
  for (const name of readdirSync(assets)) {
    if (!name.endsWith('.js')) continue;
    const text = readFileSync(join(assets, name), 'utf8');
    if (/\beval\s*\(/.test(text)) problems.push(`${name}: contains eval()`);
    if (/new Function/.test(text)) problems.push(`${name}: contains new Function`);
    const re = /(^|[^\w.$])Function\s*\(/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const at = m.index + m[1].length;
      const context = text.slice(Math.max(0, at - 90), at + 20);
      if (CAPABILITY_PROBE.test(context)) knownProbes += 1;
      else problems.push(`${name}: unrecognised Function() constructor`);
    }
  }
  if (knownProbes > 1) problems.push(`more than one recognised capability probe (${knownProbes})`);
  return problems;
}

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

// Counts persistence ATTEMPTS from before application code runs; the observers never mutate the
// surfaces they watch.
// Records Content-Security-Policy violations, installed before application code runs. Under the
// shipped policy (script-src 'self', no unsafe-eval) any dynamic code the application executes is
// refused and raises a violation, so a clean record proves the application constructs and runs no
// dynamic code under policy. Automation-injected evaluation is delivered out of band and does not
// raise a page violation, so this signal is not polluted by the test harness.
const DYNAMIC_CODE_OBSERVER = () => {
  const violations = [];
  Object.defineProperty(globalThis, '__peacCspViolations', { value: violations });
  document.addEventListener('securitypolicyviolation', (e) => {
    violations.push({
      directive: e.violatedDirective,
      source: e.sourceFile,
      blocked: e.blockedURI,
    });
  });
};

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

// A pending asynchronous file read must not replace newer manual input. The first read is held
// open by a test-only wrapper so the race is exercised deterministically, then released.
async function checkReadSupersession(page, fixtures, problems) {
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    let intercepted = false;
    File.prototype.arrayBuffer = function (...a) {
      const result = original.apply(this, a);
      if (intercepted) return result;
      intercepted = true;
      return new Promise((release) => {
        globalThis.__releaseHeldRead = () => release(result);
      });
    };
    globalThis.__restoreArrayBuffer = () => {
      File.prototype.arrayBuffer = original;
    };
  });
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'record.jws',
      mimeType: 'application/jose',
      buffer: Buffer.from(fixtures.tampered),
    });
  const pendingDisabled = await page.locator('button:disabled').count();
  if (pendingDisabled === 0) {
    problems.push('supersession: a pending file read left verification enabled');
  }
  await page.fill('#record', fixtures.record);
  await page.evaluate(() => globalThis.__releaseHeldRead());
  await page.waitForTimeout(100);
  const value = await page.inputValue('#record');
  if (value !== fixtures.record) {
    problems.push('supersession: a superseded file read replaced newer manual input');
  }
  const stale = await page.locator('section h2').count();
  if (stale !== 0) problems.push('supersession: a superseded read produced a result');
  await page
    .waitForSelector('button:enabled', { timeout: 5000 })
    .catch(() => problems.push('supersession: controls did not recover'));
  await page.evaluate(() => globalThis.__restoreArrayBuffer());
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

async function runSession(page, fixtures, origin, flowIds) {
  const problems = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(PERSISTENCE_OBSERVER);
  await page.addInitScript(DYNAMIC_CODE_OBSERVER);

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
  const cspViolations = await page.evaluate(() => globalThis.__peacCspViolations ?? []);
  for (const v of cspViolations) {
    problems.push(`CSP violation: ${v.directive} (${v.blocked ?? v.source ?? 'inline'})`);
  }
  for (const message of consoleErrors) problems.push(`console error: ${message}`);
  return { problems };
}

// Proves the CSP-violation observer is functional in this engine before the observation is used
// as evidence: on a disposable page under the shipped policy, a deliberate blocked eval must be
// recorded. A silent zero from a non-functional observer is thereby ruled out.
async function runObserverControl(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(DYNAMIC_CODE_OBSERVER);
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
  // A same-origin script (subject to the page CSP, unlike automation-injected evaluation) whose
  // Function() call is refused. addScriptTag rejects when the script errors, which is expected.
  await page.addScriptTag({ url: `${origin}/csp-observer-control.js` }).catch(() => undefined);
  await page.waitForTimeout(200);
  const recorded = await page.evaluate(() =>
    (globalThis.__peacCspViolations ?? []).some((v) => /script-src/.test(v.directive))
  );
  await context.close();
  return recorded ? [] : ['csp-observer: no violation recorded for a deliberate blocked eval'];
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
const assets = loadAssets(DIST);
if (!assets.has('/index.html')) {
  console.error('run-browser-matrix: the build output has no index.html');
  process.exit(2);
}
// A same-origin control script for the CSP-observer negative control. Loaded via <script src>, it
// is permitted by script-src 'self' and runs subject to the page policy; its Function() call is
// refused, which must raise a violation the observer records.
assets.set('/csp-observer-control.js', {
  body: Buffer.from('try{Function("return 1")()}catch(e){}'),
  type: 'text/javascript; charset=utf-8',
});
const { server, origin } = await serveAssets(assets);
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
    const observerControl = await runObserverControl(browser, origin);
    const session = await runSession(await context.newPage(), fixtures, origin);
    const problems = [
      ...observerControl,
      ...session.problems,
      ...(await runCapabilityCheck(browser, origin)),
    ];
    const version = browser.version();
    await browser.close();
    report(
      name,
      problems,
      `${version}; ${flows(fixtures).length} flows + report determinism + snapshot + ` +
        `supersession + file input + capability + CSP-observer control; no network, no persistence, ` +
        `no application CSP unsafe-eval violation`
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
      const session = await runSession(await context.newPage(), fixtures, origin, MOBILE_FLOW_IDS);
      await browser.close();
      report(m.label, session.problems, MOBILE_FLOW_IDS.join(', '));
    }
  }
} finally {
  server.close();
}
process.exit(failed ? 1 : 0);
