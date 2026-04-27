/**
 * cf-policy-x402-terms end-to-end demo
 *
 * Composes PEAC policy binding with x402 PR-1986 `terms` across the four
 * representation envelopes (`uri`, `markdown`, `plaintext`, `json`).
 *
 * Steps:
 *   1. Read a `peac-policy/0.1` document and compute its JCS+SHA-256 digest.
 *   2. Issue a signed Wire record that binds `policy.digest` and
 *      advertises x402 terms via the commerce extension.
 *   3. Compute a per-representation `terms` digest with
 *      `computeX402TermsDigest` for each of the four representations.
 *   4. Verify the receipt offline with `verifyLocal()`, threading the
 *      caller-supplied `bindings.terms` result through; print the report.
 *   5. Demonstrate the cross-representation `failed` lock by intentionally
 *      mixing a publisher digest from one representation with the
 *      verifier-side bytes of another.
 *
 * Network: none. All artifacts are read from disk; no fetch calls.
 *
 * Privacy: this demo uses non-personal-data subject identifiers
 * (service account agent IDs). See docs/privacy/DATA-CLASSIFICATION.md
 * for guidance on which fields may carry personal data in real
 * deployments.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeypair, jcsHash } from '@peac/crypto';
import {
  issue,
  verifyLocal,
  computeJsonDocumentDigestJcs,
  computeTextDocumentDigestUtf8,
  checkDocumentBinding,
} from '@peac/protocol';
import { computeX402TermsDigest } from '@peac/adapter-x402';
import type { DocumentBindingResult } from '@peac/protocol';

const HERE = dirname(fileURLToPath(import.meta.url));

function read(p: string): string {
  return readFileSync(join(HERE, p), 'utf8');
}

/**
 * Parse the demo policy.yaml into a JSON value. The demo deliberately
 * uses a tiny hand-rolled YAML reader instead of pulling in `js-yaml`
 * to keep the example dependency surface minimal. The parser only
 * understands the demo policy shape (flat map + nested map + arrays
 * of strings + simple scalars), and intentionally fails on anything
 * else. The reader is positional: it tracks the current line index
 * directly rather than scanning by string content, so duplicated
 * lines (e.g. blank or comment lines that happen to repeat) cannot
 * mis-align the lookahead.
 */
function loadPolicy(yamlText: string): Record<string, unknown> {
  const lines = yamlText.split('\n');
  const root: Record<string, unknown> = {};
  type Frame = { obj: Record<string, unknown>; indent: number; key?: string; arr?: string[] };
  const stack: Frame[] = [{ obj: root, indent: -1 }];

  // Find the next non-empty, non-comment line index strictly after `from`.
  function peekNextIndex(from: number): number {
    for (let j = from + 1; j < lines.length; j++) {
      const s = lines[j].trim();
      if (s.length > 0 && !s.startsWith('#')) return j;
    }
    return -1;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      const popped = stack.pop()!;
      if (popped.arr && popped.key) {
        stack[stack.length - 1].obj[popped.key] = popped.arr;
      }
    }

    const frame = stack[stack.length - 1];

    if (line.startsWith('- ')) {
      const value = line.slice(2).trim();
      if (!frame.arr) {
        throw new Error(`unexpected array item at indent ${indent}: ${line}`);
      }
      frame.arr.push(value.replace(/^['"]|['"]$/g, ''));
      continue;
    }

    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) throw new Error(`cannot parse line: ${raw}`);
    const [, key, rest] = m;

    if (rest === '' || rest === undefined) {
      // Either a nested object or an array follows. Decide by peeking at
      // the next significant line by index, never by string content.
      const nextIdx = peekNextIndex(i);
      const peek = nextIdx >= 0 ? lines[nextIdx] : '';
      if (peek.trim().startsWith('- ')) {
        const arr: string[] = [];
        frame.obj[key] = arr;
        stack.push({ obj: {}, indent, key, arr });
      } else {
        const next: Record<string, unknown> = {};
        frame.obj[key] = next;
        stack.push({ obj: next, indent });
      }
      continue;
    }

    let value: unknown = rest.replace(/^['"]|['"]$/g, '');
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (typeof value === 'string' && /^-?\d+$/.test(value)) value = Number(value);
    frame.obj[key] = value;
  }

  while (stack.length > 1) {
    const popped = stack.pop()!;
    if (popped.arr && popped.key) {
      stack[stack.length - 1].obj[popped.key] = popped.arr;
    }
  }

  return root;
}

async function main() {
  console.log('cf-policy-x402-terms demo');
  console.log('==========================');

  // 1. Load policy.yaml and compute the canonical digest.
  const policyYaml = read('policy.yaml');
  const policyDoc = loadPolicy(policyYaml);
  const policyDigest = `sha256:${await jcsHash(policyDoc as never)}`;
  console.log(`\n[1] policy digest:  ${policyDigest}`);

  // 2. Issue a signed Wire record with the policy digest bound in.
  const { privateKey, publicKey } = await generateKeypair();
  const kid = '2026-04-22';
  const { jws } = await issue({
    iss: 'https://api.example.com',
    sub: 'agent:demo-runner',
    kind: 'evidence',
    type: 'org.peacprotocol/inference',
    pillars: ['attribution', 'commerce'],
    policy: { digest: policyDigest, version: '1' },
    extensions: {
      'org.peacprotocol/commerce': {
        payment_rail: 'x402',
        amount_minor: '100000',
        currency: 'USD',
      },
    },
    privateKey,
    kid,
  });
  console.log(`[2] jws issued:     length=${jws.length}`);

  // 3. Compute a per-representation terms digest for each of the four
  //    x402 PR-1986 representations.
  const termsUriBytes = read('terms/terms.uri.txt').trim();
  const termsMd = read('terms/terms.md');
  const termsPlain = read('terms/terms.plaintext.txt');
  const termsJson = JSON.parse(read('terms/terms.json'));

  const digests = {
    uri: await computeX402TermsDigest({
      representation: 'uri',
      uri: termsUriBytes,
    }),
    markdown: await computeX402TermsDigest({
      representation: 'markdown',
      bytes: termsMd,
    }),
    plaintext: await computeX402TermsDigest({
      representation: 'plaintext',
      bytes: termsPlain,
    }),
    json: await computeX402TermsDigest({
      representation: 'json',
      value: termsJson,
    }),
  };
  console.log('\n[3] per-representation terms digests:');
  for (const [k, v] of Object.entries(digests)) {
    console.log(`    ${k.padEnd(9)} = ${v}`);
  }
  if (digests.uri !== 'unavailable') {
    throw new Error('uri without fetched bytes must report unavailable');
  }

  // 4. Verify the receipt offline. Thread a caller-supplied bindings.terms
  //    for the markdown representation; use checkDocumentBinding to compare
  //    the verifier-computed digest against the publisher digest.
  const publisherTermsDigestMd = await computeTextDocumentDigestUtf8(termsMd, 'markdown');
  const verifierTermsDigestMd = digests.markdown;
  const termsBinding: DocumentBindingResult = {
    ref: 'terms.md',
    representation: 'markdown',
    status: checkDocumentBinding(publisherTermsDigestMd, verifierTermsDigestMd as string),
  };
  const result = await verifyLocal(jws, publicKey, {
    issuer: 'https://api.example.com',
    policyDigest,
    bindings: { terms: termsBinding },
  });

  if (!result.valid) {
    console.error('\n[4] verifyLocal FAILED:', result);
    process.exit(1);
  }

  console.log('\n[4] verifyLocal report:');
  console.log(`    valid:               ${result.valid}`);
  console.log(`    wireVersion:         ${(result as { wireVersion: string }).wireVersion}`);
  console.log(`    policy_binding:      ${result.policy_binding}`);
  console.log(`    bindings.policy:     ${result.bindings?.policy}`);
  console.log(`    bindings.terms.ref:  ${result.bindings?.terms?.ref}`);
  console.log(`    bindings.terms.repr: ${result.bindings?.terms?.representation}`);
  console.log(`    bindings.terms.stat: ${result.bindings?.terms?.status}`);

  if (result.policy_binding !== 'verified') {
    throw new Error(`expected policy_binding=verified, got ${result.policy_binding}`);
  }
  if (result.bindings?.terms?.status !== 'verified') {
    throw new Error(
      `expected bindings.terms.status=verified, got ${result.bindings?.terms?.status}`
    );
  }

  // 5. Cross-representation failed-by-design lock.
  const crossRepStatus = checkDocumentBinding(digests.json as string, digests.plaintext as string);
  console.log(
    `\n[5] cross-representation (json publisher vs plaintext verifier): ${crossRepStatus}`
  );
  if (crossRepStatus !== 'failed') {
    throw new Error(`cross-representation comparison must be failed by design`);
  }

  // 6. Negative case: omitted publisher canonical_digest must be unavailable,
  //    not failed.
  const omittedCanonical = checkDocumentBinding(undefined, digests.json as string);
  console.log(`[6] omitted publisher canonical_digest: ${omittedCanonical}`);
  if (omittedCanonical !== 'unavailable') {
    throw new Error(`omitted publisher digest must be unavailable, not failed`);
  }

  // 7. Network-discipline check: confirm we used computeJsonDocumentDigestJcs
  //    on the JSON representation byte-identically with the dispatcher.
  const directJson = await computeJsonDocumentDigestJcs(termsJson);
  if (directJson !== digests.json) {
    throw new Error(`direct json helper must equal dispatcher output`);
  }

  console.log('\nDemo OK.');
}

main().catch((e) => {
  console.error('Demo failed:', e);
  process.exit(1);
});
