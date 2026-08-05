#!/usr/bin/env node
/**
 * Static architecture boundary gate for apps/verifier/src.
 *
 * The verifier's security properties are structural: no network, no persistence, one crypto
 * authority, text-only rendering. Those properties cannot be re-derived from a diff by inspection,
 * are asserted mechanically here.
 *
 * Usage:
 *   node scripts/check-browser-verifier-boundary.mjs
 *   node scripts/check-browser-verifier-boundary.mjs --self-test
 *
 * Exit 0 clean, 1 violations.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/verifier/src');
const INDEX_HTML = join(ROOT, 'apps/verifier/index.html');

/**
 * Approved reaches into another package's source.
 *
 * Both are primitives that the application must apply identically to the canonical verifier, and
 * neither is part of a published API surface. Any other cross-package source import is a violation.
 */
const APPROVED_CROSS_PACKAGE = /packages\/crypto\/src\/(ijson|kid)$/;
/** The ONE module allowed to call subtle.verify -- on a committed fixed vector, never user input. */
const RUNTIME_PROBE = 'lib/runtime-support.ts';

const RULES = [
  { id: 'node-import', re: /from\s+['"]node:/, msg: "node: import (the app must be browser-safe)" },
  { id: 'protocol-barrel', re: /from\s+['"]@peac\/protocol['"]/, msg: 'root @peac/protocol import (use @peac/protocol/verify-local)' },
  { id: 'fetch', re: /\bfetch\s*\(/, msg: 'fetch()' },
  { id: 'xhr', re: /\bXMLHttpRequest\b/, msg: 'XMLHttpRequest' },
  { id: 'websocket', re: /\bnew\s+WebSocket\b/, msg: 'WebSocket' },
  { id: 'eventsource', re: /\bnew\s+EventSource\b/, msg: 'EventSource' },
  { id: 'beacon', re: /\bsendBeacon\s*\(/, msg: 'navigator.sendBeacon()' },
  { id: 'localstorage', re: /\blocalStorage\b/, msg: 'localStorage' },
  { id: 'sessionstorage', re: /\bsessionStorage\b/, msg: 'sessionStorage' },
  { id: 'indexeddb', re: /\bindexedDB\b/, msg: 'indexedDB' },
  { id: 'cookie', re: /\bdocument\.cookie\b/, msg: 'document.cookie' },
  { id: 'serviceworker', re: /\bserviceWorker\b/, msg: 'service worker registration' },
  { id: 'innerhtml', re: /\.innerHTML\b/, msg: 'innerHTML' },
  { id: 'outerhtml', re: /\.outerHTML\b/, msg: 'outerHTML' },
  { id: 'insertadjacent', re: /insertAdjacentHTML/, msg: 'insertAdjacentHTML' },
  { id: 'docwrite', re: /document\.write\s*\(/, msg: 'document.write()' },
  { id: 'eval', re: /\beval\s*\(/, msg: 'eval()' },
  { id: 'newfunction', re: /\bnew\s+Function\s*\(/, msg: 'new Function()' },
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function scanText(rel, text) {
  const violations = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    for (const r of RULES) {
      if (r.re.test(line)) violations.push(`${rel}:${i + 1}: ${r.msg}`);
    }
    // subtle.verify only inside the named runtime probe
    if (/crypto\.subtle\.verify|subtle\.verify\s*\(/.test(line) && !rel.endsWith(RUNTIME_PROBE)) {
      violations.push(`${rel}:${i + 1}: subtle.verify outside ${RUNTIME_PROBE}`);
    }
    // cross-package source reach: only the approved I-JSON module
    const imp = line.match(/from\s+['"]([^'"]*packages\/[^'"]+)['"]/);
    if (imp && !APPROVED_CROSS_PACKAGE.test(imp[1])) {
      violations.push(`${rel}:${i + 1}: reaches into another package's source (${imp[1]})`);
    }
  }
  return violations;
}

function selfTest() {
  const cases = [
    ["import x from 'node:fs';", 'node-import'],
    ["const r = await fetch('/x');", 'fetch'],
    ['localStorage.setItem("a","b");', 'localstorage'],
    ['el.innerHTML = x;', 'innerhtml'],
    ['navigator.serviceWorker.register("/sw.js");', 'serviceworker'],
    ['const f = new Function("return 1");', 'newfunction'],
    ["import { z } from '../../../../packages/schema/src/index';", 'cross-package'],
    ['await crypto.subtle.verify(alg, k, sig, msg);', 'subtle'],
  ];
  let failed = 0;
  for (const [line, label] of cases) {
    const v = scanText('lib/fake.ts', line);
    if (v.length === 0) { console.error(`  SELF-TEST FAIL: ${label} was not caught`); failed++; }
    else console.log(`  ok  negative fixture caught: ${label}`);
  }
  const clean = scanText('lib/fake.ts', "import { assertIJson } from '../../../../packages/crypto/src/ijson';\nconst n = document.createElement('p');\nn.textContent = 'x';");
  if (clean.length !== 0) { console.error('  SELF-TEST FAIL: clean fixture flagged: ' + clean.join('; ')); failed++; }
  else console.log('  ok  clean fixture passes (approved I-JSON import + textContent)');
  return failed;
}

if (process.argv.includes('--self-test')) {
  const failed = selfTest();
  if (failed) { console.error(`browser-verifier boundary self-test: ${failed} FAILED`); process.exit(1); }
  console.log('browser-verifier boundary self-test: all negative fixtures caught, clean fixture passes');
  process.exit(0);
}

if (!existsSync(SRC)) {
  console.error(`boundary gate: ${SRC} not found`);
  process.exit(1);
}

const violations = [];
let scanned = 0;
for (const file of walk(SRC)) {
  scanned++;
  violations.push(...scanText(relative(ROOT, file), readFileSync(file, 'utf8')));
}

// Production CSP must be present and closed.
if (existsSync(INDEX_HTML)) {
  const html = readFileSync(INDEX_HTML, 'utf8');
  // Directives that a META-delivered CSP actually enforces. frame-ancestors is deliberately NOT in
  // this list: a user agent ignores it in a meta element, so requiring it here would make the gate
  // assert a protection the document cannot provide.
  for (const needed of ["connect-src 'none'", "worker-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    if (!html.includes(needed)) violations.push(`apps/verifier/index.html: CSP missing ${needed}`);
  }
  // Check the CSP VALUE, not the whole document: the comment beside it explains why the directive
  // is absent, and a file-wide match would flag that explanation.
  const cspValue = html.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]*)"/)?.[1] ?? '';
  if (cspValue.includes('frame-ancestors')) {
    violations.push(
      'apps/verifier/index.html: frame-ancestors is declared in a meta CSP, where it is ignored. ' +
        'Framing protection belongs in a response header on the serving origin.'
    );
  }
}

if (violations.length) {
  console.error(`browser-verifier boundary: ${violations.length} violation(s)`);
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}
console.log(
  'browser-verifier boundary: OK -- no forbidden source pattern detected across ' +
    `${scanned} scanned file(s): no network, storage, service-worker, HTML-injection or dynamic-code ` +
    'sink, and one crypto authority. ' +
    'ENFORCED BY THE BUILT HTML: connect-src, worker-src, object-src, base-uri and form-action. ' +
    'REQUIRES RESPONSE HEADERS AT THE SERVING ORIGIN: frame-ancestors and X-Frame-Options, which a ' +
    'meta CSP cannot provide.'
);
