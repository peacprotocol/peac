/**
 * v0.14.1: A2A extension URI canonicalization audit (narrowly scoped).
 *
 * The PEAC A2A traceability extension URI is the canonical full URI
 *   https://www.peacprotocol.org/ext/traceability/v1
 * exported as `PEAC_EXTENSION_URI` in `packages/mappings/a2a/src/types.ts`.
 *
 * The integrator kit README at `integrator-kits/a2a/README.md` previously used
 * the bare reverse-DNS prefix `org.peacprotocol` as an extension-URI claim.
 * That bare form is NOT the extension URI. PR 1 of v0.14.1 fixed it; this
 * test prevents regression.
 *
 * Scope is intentionally narrow: only `integrator-kits/a2a/README.md`. The
 * pattern would produce false positives in `docs/` and `examples/` because
 * the `org.peacprotocol/<pillar>` form is a legitimate type-value prefix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const FILE = join(ROOT, 'integrator-kits/a2a/README.md');

describe('A2A extension URI canonicalization (integrator-kits/a2a/README.md)', () => {
  it('does not use bare org.peacprotocol as an extension URI claim', () => {
    const text = readFileSync(FILE, 'utf8');

    // Match `org.peacprotocol` NOT followed by `/<lowercase letter>` (which
    // would be a legitimate type-value prefix like org.peacprotocol/payment).
    // Also exclude inline-code mentions of the bare token in negative-example
    // prose (e.g. "Verify the metadata key is ... not the bare reverse-DNS prefix
    // `org.peacprotocol`, which is not the extension URI" remains acceptable).
    //
    // CodeQL note: substring matching on URLs (e.g. `line.includes('https://...')`)
    // is flagged as URL-substring-sanitization (CWE-20) because an attacker
    // could embed the canonical URL as a substring of a different host. We use
    // a token-bounded regex instead: the canonical URL must appear as a
    // discrete token (surrounded by whitespace, quote, backtick, paren, or
    // start/end of line) so a path/query suffix on a different host cannot
    // satisfy the check.
    const CANONICAL_URL_TOKEN =
      /(^|[\s"'`(<>])https:\/\/www\.peacprotocol\.org\/ext\/traceability\/v1(?=$|[\s"'`)<>])/;
    const lines = text.split(/\r?\n/);
    const offenders: { line: number; content: string }[] = [];
    lines.forEach((line, idx) => {
      // Strip any line that is itself the canonical-correction prose
      const isCorrectionProse =
        line.includes('not the bare reverse-DNS prefix') ||
        line.includes('which is not the extension URI');
      if (isCorrectionProse) return;
      // Strip lines that already use the canonical full URI as a discrete token
      const usesCanonical = CANONICAL_URL_TOKEN.test(line);
      // Match bare `org.peacprotocol` (boundary, not followed by /)
      const m = line.match(/org\.peacprotocol(?!\/[a-z])/g);
      if (m && !usesCanonical) {
        offenders.push({ line: idx + 1, content: line.trim() });
      }
    });

    expect(
      offenders,
      `Bare 'org.peacprotocol' extension-URI claim found:\n${offenders
        .map((o) => `  ${FILE}:${o.line}: ${o.content}`)
        .join('\n')}`
    ).toEqual([]);
  });
});
