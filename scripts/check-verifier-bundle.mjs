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
const DIST = join(ROOT, argIdx >= 0 && process.argv[argIdx + 1] ? process.argv[argIdx + 1] : 'apps/verifier/dist');

/**
 * Patterns that must not survive into emitted JavaScript.
 *
 * These are matched against MINIFIED output, so they are deliberately shape-based rather than
 * source-shaped. Comment text cannot be relied on to exist or to be excluded.
 */
const FORBIDDEN = [
  { id: 'browser-external-stub', re: /__vite-browser-external/, msg: 'Vite browser-external stub (a Node builtin reached the bundle)' },
  { id: 'node-protocol-import', re: /["'`]node:[a-z_]+["'`]/, msg: 'node: builtin specifier' },
  { id: 'node-globals', re: /\brequire\s*\(\s*["'`](fs|path|os|child_process|worker_threads)["'`]\s*\)/, msg: 'CommonJS require of a Node builtin' },
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
    if (!hit.includes(id)) { console.error(`  SELF-TEST FAIL: ${id} not caught in ${JSON.stringify(text)}`); failed++; }
    else console.log(`  ok  negative fixture caught: ${id}`);
  }
  const clean = 'const n=document.createElement("p");n.textContent=x;await crypto.subtle.digest("SHA-256",b);';
  const bad = FORBIDDEN.filter((f) => f.re.test(clean));
  if (bad.length) { console.error('  SELF-TEST FAIL: clean fixture flagged: ' + bad.map((b) => b.id).join(',')); failed++; }
  else console.log('  ok  clean fixture passes (createElement + textContent + subtle.digest)');
  return failed;
}

if (process.argv.includes('--self-test')) {
  const failed = selfTest();
  console.log(failed ? `verifier bundle self-test: ${failed} FAILED` : 'verifier bundle self-test: all negative fixtures caught');
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
for (const f of js) {
  const text = readFileSync(f, 'utf8');
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) violations.push(`${relative(ROOT, f)}: ${rule.msg}`);
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
console.log(
  `verifier bundle: OK -- ${js.length} emitted JS asset(s), ${html.length} HTML; ` +
    'no forbidden pattern detected in the emitted output (Node builtin, browser-external stub, ' +
    'network, storage, service-worker, HTML-injection or dynamic-code path). ' +
    'This is a static scan of what was emitted; the real-browser smoke test provides the runtime ' +
    'observation. Framing protection (frame-ancestors, X-Frame-Options) is not expressible in the ' +
    'emitted HTML and remains a response-header requirement at the serving origin.'
);
