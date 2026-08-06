/**
 * Error semantics of the measurement harnesses.
 *
 * A harness that converts a runtime failure into `reject` fabricates cryptographic evidence, which
 * is the defect that once produced seventeen invented rejections. These assertions are structural:
 * they read the harness sources and require that only a returned boolean decides, that capability
 * errors are matched exactly, and that a browser is released on failure. Structural checks are used
 * because the classification is inline in a standalone script; each rule is paired with a mutation
 * that changes exactly that construct.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CRYPTO_ROOT = resolve(__dirname, '..');
const NODE_HARNESS = join(CRYPTO_ROOT, 'tests', 'tools', 'measure-ed25519-runtimes.mjs');
const BROWSER_HARNESS = join(CRYPTO_ROOT, 'tests', 'tools', 'measure-ed25519-browsers.mjs');

const nodeSource = readFileSync(NODE_HARNESS, 'utf8');
const browserSource = readFileSync(BROWSER_HARNESS, 'utf8');

/** Error names and codes that must never be treated as a cryptographic rejection. */
const NEVER_REJECTION = [
  'OperationError',
  'DataError',
  'ERR_OSSL_UNSUPPORTED',
  'ERR_OSSL_EVP_DECODE_ERROR',
  'ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE',
];

describe('the Node harness never converts a failure into a rejection', () => {
  it.each(NEVER_REJECTION)('does not classify %s', (name) => {
    // Measured across every pinned Node version: no corpus vector raises an exception, so any
    // mapping from an error to `reject` is unreachable except when something is wrong.
    const mentions = nodeSource.split(name).length - 1;
    const asRejection = new RegExp(`${name}[^\\n]*return 'reject'`);
    expect(asRejection.test(nodeSource), `${name} is mapped to a rejection`).toBe(false);
    // A mention inside the explanatory comment is expected; a branch is not.
    expect(mentions).toBeLessThanOrEqual(1);
  });

  it('treats only the documented capability errors as unsupported', () => {
    expect(nodeSource).toContain("err?.name === 'NotSupportedError'");
    expect(nodeSource).toContain("err?.code === 'ERR_CRYPTO_UNSUPPORTED_OPERATION'");
  });

  it('aborts on every other exception', () => {
    for (const context of [
      'node:webcrypto importKey',
      'node:webcrypto verify',
      'node:crypto createPublicKey',
      'node:crypto verify',
    ]) {
      expect(nodeSource, `${context} does not abort`).toContain(context);
    }
    expect(nodeSource).toContain('class HarnessError extends Error');
  });

  it('decides only on a returned boolean', () => {
    expect(nodeSource).toMatch(/typeof ok !== 'boolean'/);
    expect(nodeSource).toMatch(/typeof result !== 'boolean'/);
  });
});

describe('the browser harness matches capability errors exactly', () => {
  it('uses a structured error name, not a message substring', () => {
    expect(browserSource).toContain("err.name === 'Ed25519RuntimeError'");
    // A substring match would classify any unrelated failure whose wording contains the word.
    expect(browserSource).not.toMatch(/test\(`\$\{err\.name\}\$\{err\.message\}`\)/);
    expect(browserSource).not.toMatch(/\/Ed25519RuntimeError\|unavailable\//);
  });

  it.each(NEVER_REJECTION)('does not classify %s as a rejection', (name) => {
    expect(new RegExp(`${name}[^\\n]*'reject'`).test(browserSource), `${name} maps to reject`).toBe(
      false
    );
  });

  it('releases each browser through a finally block', () => {
    // Without this a failure during navigation, injection, controls or measurement leaks a process.
    expect(browserSource).toMatch(/\}\s*finally\s*\{\s*await browser\.close\(\);\s*\}/);
  });

  it('checks a positive and a negative control on both surfaces', () => {
    for (const control of [
      'messages_differ',
      'raw_accept',
      'raw_reject',
      'wrapper_accept',
      'wrapper_reject',
    ]) {
      expect(browserSource, `${control} is not asserted`).toContain(`'${control}'`);
    }
    expect(browserSource).toMatch(/\['raw_reject', false\]/);
    expect(browserSource).toMatch(/\['wrapper_reject', false\]/);
    expect(browserSource).toMatch(/\['messages_differ', true\]/);
  });

  it('the negative control changes the message, not the signature', () => {
    // Mutating the signature could be rejected by the admissibility precheck, which would prove
    // nothing about the delegated equation. Changing the message can only fail at that equation.
    expect(browserSource).toContain('rawVerify(changed)');
    expect(browserSource).toContain('__peacVerify(signature, changed, raw)');
    // The key and signature must be the ones the positive control used.
    expect(browserSource).toContain('rawVerify(original)');
    expect(browserSource).toContain('__peacVerify(signature, original, raw)');
    expect(browserSource).not.toMatch(/tampered\[0\] \^= 0x01/);
  });
});

describe('the measurement tools reference the build output without importing it', () => {
  // guard.sh exempts this directory from the dist rule because these tools hash a build artifact as
  // evidence. That exemption must not become cover for an actual dist import.
  const TOOLS = join(CRYPTO_ROOT, 'tests', 'tools');
  const sources = readdirSync(TOOLS)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => [f, readFileSync(join(TOOLS, f), 'utf8')] as const);

  it('reads more than one tool', () => {
    expect(sources.length).toBeGreaterThan(1);
  });

  it.each(sources.map(([name]) => name))('%s does not import from dist', (name) => {
    const source = sources.find(([f]) => f === name)![1];
    expect(source).not.toMatch(/(?:import|require)\s*\(?\s*['"][^'"]*\/dist\//);
    expect(source).not.toMatch(/from\s+['"][^'"]*\/dist\//);
  });
});
