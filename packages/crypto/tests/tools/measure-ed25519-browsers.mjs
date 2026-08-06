#!/usr/bin/env node
/**
 * Measure browser Ed25519 decisions for the conformance corpus.
 *
 * Records two outcomes per browser: the raw SubtleCrypto decision, and the decision of the PEAC
 * verification wrapper running in that browser. Outcomes are exactly accept, reject or unsupported;
 * an unexpected error aborts the run rather than being recorded as a rejection.
 *
 * Playwright and esbuild are optional and are imported at run time. They are deliberately not
 * package dependencies: nothing in the test suite runs this tool. When they are absent the tool
 * exits with setup instructions rather than skipping silently.
 *
 * Setup (outside the workspace, so no manifest or lockfile changes):
 *   mkdir -p /tmp/peac-browser-deps && cd /tmp/peac-browser-deps
 *   pnpm init && pnpm add playwright esbuild
 *   pnpm exec playwright install chromium firefox webkit
 *
 * Usage:
 *   pnpm --filter @peac/crypto build
 *   node measure-ed25519-browsers.mjs --deps /tmp/peac-browser-deps [--observed-on YYYY-MM-DD]
 *
 * Writes a JSON document to stdout. Never mutates the corpus.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CORPUS_PATH,
  LOCKFILE_PATH,
  MEASURED_ARTIFACT_PATH,
  PRODUCTION_SOURCES,
  fileDigest,
  productionSourceManifestDigest,
  resolveSourceRevision,
  sha256,
} from './evidence-provenance.mjs';

const SELF = fileURLToPath(import.meta.url);
const HERE = dirname(SELF);
const CRYPTO_ROOT = resolve(HERE, '..', '..');
const REPO_ROOT = resolve(CRYPTO_ROOT, '..', '..');

const SETUP =
  'Install the optional measurement dependencies outside the workspace, then point the tool at\n' +
  'them so no package manifest or lockfile is touched:\n' +
  '  mkdir -p /tmp/peac-browser-deps && cd /tmp/peac-browser-deps\n' +
  '  pnpm init && pnpm add playwright esbuild\n' +
  '  pnpm exec playwright install chromium firefox webkit\n' +
  '  node <this tool> --deps /tmp/peac-browser-deps';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
};

const vectorsPath = resolve(
  opt(
    '--vectors',
    join(REPO_ROOT, 'specs', 'conformance', 'parity-corpus', 'ed25519-peac-profile', 'vectors.json')
  )
);
const observedOn = opt('--observed-on', new Date().toISOString().slice(0, 10));
if (!/^\d{4}-\d{2}-\d{2}$/.test(observedOn)) {
  throw new Error(`--observed-on must be YYYY-MM-DD, got: ${observedOn}`);
}
const sourceRevision = resolveSourceRevision(REPO_ROOT, opt('--source-revision', null));

const bundlePath = join(CRYPTO_ROOT, 'dist', 'index.mjs');
if (!existsSync(bundlePath)) {
  console.error(
    `measure-ed25519-browsers: ${bundlePath} is missing. Run: pnpm --filter @peac/crypto build`
  );
  process.exit(2);
}

// Optional dependencies resolve from --deps when given, so they can live outside the workspace and
// leave every package manifest and lockfile untouched.
const depsRoot = opt('--deps', null);
const specifier = (name) =>
  depsRoot ? pathToFileURL(join(resolve(depsRoot), 'node_modules', name, 'index.js')).href : name;

let playwright;
let esbuild;
try {
  const pw = await import(specifier('playwright'));
  const eb = await import(
    depsRoot ? specifier('esbuild').replace(/index\.js$/, 'lib/main.js') : 'esbuild'
  );
  // Loaded by file URL, a CommonJS package exposes its API on `default`.
  playwright = pw.default ?? pw;
  esbuild = eb.default ?? eb;
} catch (err) {
  console.error(`measure-ed25519-browsers: ${err.message}\n\n${SETUP}`);
  process.exit(2);
}

// Provenance must be exact: an unknown runner version would make the recorded evidence
// unreproducible, so a version that cannot be resolved is fatal rather than a placeholder.
function requiredVersion(name) {
  const manifest = depsRoot
    ? join(resolve(depsRoot), 'node_modules', name, 'package.json')
    : new URL(`../../../../node_modules/${name}/package.json`, import.meta.url);
  try {
    const version = JSON.parse(readFileSync(manifest, 'utf8')).version;
    if (typeof version === 'string' && version.length > 0) return version;
  } catch (err) {
    throw new Error(`cannot resolve the ${name} version from ${manifest}: ${err.message}`);
  }
  throw new Error(`the ${name} manifest declares no version`);
}

const playwrightVersion = requiredVersion('playwright');
const esbuildVersion = requiredVersion('esbuild');

const corpus = JSON.parse(readFileSync(vectorsPath, 'utf8'));
const harnessSha256 = sha256(readFileSync(SELF));
const corpusSha256 = fileDigest(REPO_ROOT, CORPUS_PATH);
const lockfileSha256 = fileDigest(REPO_ROOT, LOCKFILE_PATH);
// The wrapper surface measures built PEAC code, so the evidence names the exact artifact and
// the exact production sources behind it, using the shared canonical algorithm.
const measuredArtifactSha256 = fileDigest(REPO_ROOT, MEASURED_ARTIFACT_PATH);
const productionSourceManifestSha256 = productionSourceManifestDigest(
  REPO_ROOT,
  PRODUCTION_SOURCES
);

const bundled = await esbuild.build({
  stdin: {
    contents: `import { ed25519Verify } from ${JSON.stringify(bundlePath)};
               globalThis.__peacVerify = ed25519Verify;`,
    resolveDir: CRYPTO_ROOT,
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
});
const wrapperSource = bundled.outputFiles[0].text;
const wrapperBundleSha256 = sha256(Buffer.from(wrapperSource));

/**
 * Runs inside the page. Returns an outcome per vector for the raw primitive and the wrapper, or an
 * error string, which the caller turns into an abort.
 */
async function measureInPage(vectors) {
  // An empty message is a valid vector (RFC 8032 test 1) and ''.match returns null.
  const toBytes = (hex) => Uint8Array.from((hex.match(/../g) ?? []).map((b) => parseInt(b, 16)));
  const out = [];

  for (const v of vectors) {
    const pub = toBytes(v.public_key_hex);
    const msg = toBytes(v.message_hex);
    const sig = toBytes(v.signature_hex);

    // Only a returned boolean is a cryptographic decision. OperationError is specified as an
    // operation-specific failure, not a synonym for an invalid signature, so it aborts.
    let raw;
    try {
      const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
      const ok = await crypto.subtle.verify('Ed25519', key, sig, msg);
      raw = typeof ok === 'boolean' ? (ok ? 'accept' : 'reject') : { error: 'non-boolean verify' };
    } catch (err) {
      raw =
        err && err.name === 'NotSupportedError'
          ? 'unsupported'
          : { error: `raw ${v.id}: ${err && err.name}: ${err && err.message}` };
    }

    let wrapped;
    try {
      const ok = await globalThis.__peacVerify(sig, msg, pub);
      wrapped = typeof ok === 'boolean' ? (ok ? 'accept' : 'reject') : { error: 'non-boolean' };
    } catch (err) {
      // Exact structured error name only. Matching on message text would classify any unrelated
      // failure whose wording happens to include a keyword.
      wrapped =
        err && err.name === 'Ed25519RuntimeError'
          ? 'unsupported'
          : { error: `wrapper ${v.id}: ${err && err.name}: ${err && err.message}` };
    }

    out.push({ vector_id: v.id, raw, wrapped });
  }
  return out;
}

/**
 * Self-generated control for one browser: a non-empty message signed in the page, then the same
 * signature with one bit flipped. Both surfaces must accept the first and reject the second, so a
 * surface that returns a constant cannot look like a complete measurement. A non-empty message is
 * used so that the zero-length-message divergence cannot affect the control.
 */
async function controlInPage() {
  const encoder = new TextEncoder();
  const original = encoder.encode('peac ed25519 browser control');
  // A different non-empty message, verified against the SAME key and signature. Mutating the
  // signature instead could be rejected by the admissibility precheck, which would prove nothing
  // about the delegated equation; changing the message can only fail at that equation.
  const changed = encoder.encode('peac ed25519 browser control (changed)');

  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, original));

  const rawVerify = async (message) => {
    const key = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify('Ed25519', key, signature, message);
  };

  return {
    messages_differ: original.length !== changed.length ||
      original.some((byte, i) => byte !== changed[i]),
    raw_accept: await rawVerify(original),
    raw_reject: await rawVerify(changed),
    wrapper_accept: await globalThis.__peacVerify(signature, original, raw),
    wrapper_reject: await globalThis.__peacVerify(signature, changed, raw),
  };
}

// crypto.subtle exists only in a secure context, which about:blank is not. Loopback counts.
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><meta charset="utf-8"><title>measure</title>');
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}/`;

const environments = {};
const observations = [];

try {
  for (const name of ['chromium', 'firefox', 'webkit']) {
    const browser = await playwright[name].launch();
    const version = browser.version();
    let rows;
    // Each browser closes even when navigation, injection, controls or measurement fail.
    try {
      const page = await browser.newPage();
      await page.goto(origin);
      const secure = await page.evaluate(() => globalThis.isSecureContext && !!crypto?.subtle);
      if (!secure) throw new Error(`${name}: SubtleCrypto is unavailable in a secure context`);
      await page.addScriptTag({ content: wrapperSource });

      const control = await page.evaluate(controlInPage);
      for (const [field, expected] of [
        ['messages_differ', true],
        ['raw_accept', true],
        ['raw_reject', false],
        ['wrapper_accept', true],
        ['wrapper_reject', false],
      ]) {
        if (control[field] !== expected) {
          throw new Error(`${name}: control ${field} was ${control[field]}, expected ${expected}`);
        }
      }

      rows = await page.evaluate(measureInPage, corpus.vectors);
    } finally {
      await browser.close();
    }

    const base = {
      engine: name,
      version,
      runtime: 'playwright',
      runtime_version: playwrightVersion,
      bundler_version: esbuildVersion,
      platform: `${process.platform}/${process.arch}`,
      os_release: release(),
      harness: 'packages/crypto/tests/tools/measure-ed25519-browsers.mjs',
      // The port is ephemeral; only the host determines secure-context status.
      secure_context_origin: 'http://127.0.0.1',
      harness_sha256: harnessSha256,
      corpus_sha256: corpusSha256,
      lockfile_sha256: lockfileSha256,
    };
    const rawId = `${name}-${version}-webcrypto`;
    const wrapId = `${name}-${version}-peac-wrapper`;
    environments[rawId] = {
      ...base,
      implementation: `${name}:webcrypto`,
      surface: 'raw-primitive',
    };
    environments[wrapId] = {
      ...base,
      implementation: `${name}:peac-wrapper`,
      surface: 'peac-wrapper',
      measured_artifact_sha256: measuredArtifactSha256,
      wrapper_bundle_sha256: wrapperBundleSha256,
      production_source_manifest_sha256: productionSourceManifestSha256,
    };

    for (const row of rows) {
      for (const [id, outcome] of [
        [rawId, row.raw],
        [wrapId, row.wrapped],
      ]) {
        if (typeof outcome !== 'string') throw new Error(`${name}: ${outcome.error}`);
        observations.push({ vector_id: row.vector_id, environment_id: id, outcome });
      }
    }
  }
} finally {
  server.close();
}

const expected = corpus.vectors.length * 6;
if (observations.length !== expected) {
  throw new Error(`expected ${expected} observations, produced ${observations.length}`);
}

// Controls: a run that accepts nothing has not measured anything meaningful.
const accepted = observations.filter(
  (o) => o.vector_id === 'peac-sign-positive' && o.outcome !== 'unsupported'
);
if (accepted.length === 0 || accepted.some((o) => o.outcome !== 'accept')) {
  const bad = accepted.filter((o) => o.outcome !== 'accept').map((o) => o.environment_id);
  throw new Error(`accept control not accepted by: ${bad.join(', ') || '(no measurable result)'}`);
}

process.stdout.write(
  `${JSON.stringify(
    {
      observed_on: observedOn,
      measurement_source_revision: sourceRevision,
      environments,
      observations,
    },
    null,
    2
  )}\n`
);
