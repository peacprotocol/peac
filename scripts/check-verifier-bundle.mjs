#!/usr/bin/env node
/**
 * BUILT-OUTPUT gate for the verifier.
 *
 * The source scanner (check-browser-verifier-boundary.mjs) proves what apps/verifier/src contains.
 * It cannot prove what a dependency dragged into the bundle: a Node builtin, a polyfill shim, or a
 * network call reached through a package barrel. This gate reads the EMITTED JavaScript instead.
 *
 * Usage:
 *   node scripts/check-verifier-bundle.mjs [--dist apps/verifier/dist]
 *   node scripts/check-verifier-bundle.mjs --self-test
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argIdx = process.argv.indexOf('--dist');
const DIST = join(
  ROOT,
  argIdx >= 0 && process.argv[argIdx + 1] ? process.argv[argIdx + 1] : 'apps/verifier/dist'
);

/**
 * Patterns that must not survive into emitted JavaScript.
 *
 * These are matched against MINIFIED output, so they are deliberately shape-based rather than
 * source-shaped. Comment text cannot be relied on to exist or to be excluded.
 */
const FORBIDDEN = [
  {
    id: 'browser-external-stub',
    re: /__vite-browser-external/,
    msg: 'Vite browser-external stub (a Node builtin reached the bundle)',
  },
  { id: 'node-protocol-import', re: /["'`]node:[a-z_]+["'`]/, msg: 'node: builtin specifier' },
  {
    id: 'node-globals',
    re: /\brequire\s*\(\s*["'`](fs|path|os|child_process|worker_threads)["'`]\s*\)/,
    msg: 'CommonJS require of a Node builtin',
  },
  { id: 'fetch', re: /\bfetch\s*\(/, msg: 'fetch() call' },
  { id: 'xhr', re: /\bXMLHttpRequest\b/, msg: 'XMLHttpRequest' },
  { id: 'websocket', re: /new\s+WebSocket\b/, msg: 'WebSocket' },
  { id: 'eventsource', re: /new\s+EventSource\b/, msg: 'EventSource' },
  { id: 'beacon', re: /\.sendBeacon\s*\(/, msg: 'navigator.sendBeacon()' },
  { id: 'localstorage', re: /\blocalStorage\b/, msg: 'localStorage' },
  { id: 'sessionstorage', re: /\bsessionStorage\b/, msg: 'sessionStorage' },
  { id: 'indexeddb', re: /\bindexedDB\b/, msg: 'indexedDB' },
  { id: 'serviceworker', re: /serviceWorker\s*\.\s*register/, msg: 'service-worker registration' },
  { id: 'innerhtml', re: /\.innerHTML\s*=/, msg: 'innerHTML assignment' },
  { id: 'eval', re: /\beval\s*\(/, msg: 'eval()' },
  { id: 'newfunction', re: /new\s+Function\s*\(/, msg: 'new Function()' },
];

/**
 * Bare `Function(...)` constructor calls, excluding `new Function` (covered above), property
 * accesses like `.Function(` and identifiers ending in `Function`. Each hit is reported with a
 * little surrounding context so it can be classified.
 */
function bareFunctionConstructors(text) {
  const hits = [];
  const re = /(^|[^\w.$])Function\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const at = m.index + m[1].length;
    hits.push(text.slice(Math.max(0, at - 90), at + 12));
  }
  return hits;
}

/**
 * A bare constructor is the dependency's Ed25519-unrelated capability probe: a memoized check that
 * builds an empty function to learn whether the environment permits dynamic evaluation. It is
 * gated off at runtime (validator compilation is disabled application-wide) and never executes
 * under the shipped policy, which the browser matrix proves by instrumentation. It is recognised
 * by its own guard and its empty argument, so any other dynamic-code construction still fails.
 */
function isKnownCapabilityProbe(context) {
  return /Cloudflare/.test(context) && /Function\s*\(\s*(``|''|"")\s*\)/.test(context);
}

function selfTest() {
  const cases = [
    ['import("./__vite-browser-external-x.js")', 'browser-external-stub'],
    ['import("node:fs")', 'node-protocol-import'],
    ['await fetch("/x")', 'fetch'],
    ['localStorage.setItem(a,b)', 'localstorage'],
    ['navigator.serviceWorker.register("/sw.js")', 'serviceworker'],
    ['e.innerHTML = x', 'innerhtml'],
    ['new Function("return 1")', 'newfunction'],
  ];
  let failed = 0;
  for (const [text, id] of cases) {
    const hit = FORBIDDEN.filter((f) => f.re.test(text)).map((f) => f.id);
    if (!hit.includes(id)) {
      console.error(`  SELF-TEST FAIL: ${id} not caught in ${JSON.stringify(text)}`);
      failed++;
    } else console.log(`  ok  negative fixture caught: ${id}`);
  }
  // A bare Function() constructor that is NOT the known probe must be rejected.
  const unknownCtor = 'const x=Function("return 1");';
  const unknownHits = bareFunctionConstructors(unknownCtor).filter(
    (c) => !isKnownCapabilityProbe(c)
  );
  if (unknownHits.length !== 1) {
    console.error('  SELF-TEST FAIL: bare Function() constructor not caught');
    failed++;
  } else console.log('  ok  negative fixture caught: bare Function() constructor');
  // The known capability probe is recognised and does not fail the gate.
  const probe =
    'if(navigator?.userAgent?.includes(`Cloudflare`))return!1;try{return Function(``),!0}catch{return!1}';
  const probeHits = bareFunctionConstructors(probe);
  if (probeHits.length !== 1 || !isKnownCapabilityProbe(probeHits[0])) {
    console.error('  SELF-TEST FAIL: capability probe not recognised');
    failed++;
  } else console.log('  ok  capability probe recognised (allowed, unexecuted)');
  const clean =
    'const n=document.createElement("p");n.textContent=x;await crypto.subtle.digest("SHA-256",b);';
  const bad = FORBIDDEN.filter((f) => f.re.test(clean));
  if (bad.length) {
    console.error('  SELF-TEST FAIL: clean fixture flagged: ' + bad.map((b) => b.id).join(','));
    failed++;
  } else console.log('  ok  clean fixture passes (createElement + textContent + subtle.digest)');
  return failed;
}

if (process.argv.includes('--self-test')) {
  const failed = selfTest();
  console.log(
    failed
      ? `verifier bundle self-test: ${failed} FAILED`
      : 'verifier bundle self-test: all negative fixtures caught'
  );
  process.exit(failed ? 1 : 0);
}

if (!existsSync(DIST)) {
  console.error(`bundle gate: ${relative(ROOT, DIST)} not found -- run the production build first`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const assets = walk(DIST);
const js = assets.filter((f) => /\.(js|mjs)$/.test(f));
if (js.length === 0) {
  console.error('bundle gate: no JavaScript assets found');
  process.exit(1);
}

const violations = [];
let knownProbeCount = 0;
for (const f of js) {
  const text = readFileSync(f, 'utf8');
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) violations.push(`${relative(ROOT, f)}: ${rule.msg}`);
  }
  for (const context of bareFunctionConstructors(text)) {
    if (isKnownCapabilityProbe(context)) knownProbeCount += 1;
    else violations.push(`${relative(ROOT, f)}: unrecognised Function() constructor`);
  }
}

// The emitted HTML must carry the closed CSP.
const html = assets.filter((f) => f.endsWith('.html'));
for (const f of html) {
  const text = readFileSync(f, 'utf8');
  // Only directives a meta CSP actually enforces.
  for (const needed of ["connect-src 'none'", "worker-src 'none'", "object-src 'none'"]) {
    if (!text.includes(needed)) violations.push(`${relative(ROOT, f)}: CSP missing ${needed}`);
  }
}

if (violations.length) {
  console.error(`verifier bundle: ${violations.length} violation(s) in emitted output`);
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}
const probeNote =
  knownProbeCount > 0
    ? `the only Function() constructor present is a dependency capability probe (x${knownProbeCount}), ` +
      'disabled application-wide and proven unexecuted by the browser matrix; '
    : '';
console.log(
  `verifier bundle: OK -- ${js.length} emitted JS asset(s), ${html.length} HTML; ` +
    'no forbidden pattern in the emitted output (Node builtin, browser-external stub, network, ' +
    'storage, service-worker, HTML-injection, eval or new Function); ' +
    probeNote +
    'no other dynamic-code construction. This is a static scan; the browser matrix observes at ' +
    'runtime that no dynamic code executes and no policy violation is raised. Framing protection ' +
    '(frame-ancestors, X-Frame-Options) is not expressible in the emitted HTML and remains a ' +
    'response-header requirement at the serving origin.'
);
