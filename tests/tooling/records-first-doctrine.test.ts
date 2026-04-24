/**
 * v0.13.0 records-first doctrine audit (PR A).
 *
 * Per CLAUDE.md (2026-04-18 wording rules) and plan §2 invariants, active
 * public-facing docs MUST lead with tier-(a) records-first framing (e.g.
 * "open standard for verifiable interaction records" / "portable signed
 * records"). Tier-(c) phrases like "evidence plane" / "evidence floor"
 * are quarantined to explicitly-deep sections (anti-absorption doctrine,
 * threat-model internals, compliance mapping prose) and MUST NOT appear
 * in the top 80 lines of any active front-door doc.
 *
 * This test scans the top 80 lines of each active front-door doc and
 * fails if any tier-(c) phrase appears without a legitimizing marker.
 *
 * Note: the canonical check for derivatives lives in
 * reference/scripts/verify-final-hygiene.mjs. This test covers the
 * public-repo subset so that the same invariant is enforced both from
 * the local planning side and from the public CI side.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// Active front-door docs: the role-based entry points that lead an
// external reader's first 80 lines. Expansions to this list are allowed
// as new front-door surfaces land; each entry MUST be a real doc path.
const FRONT_DOOR_DOCS = [
  'README.md',
  'docs/START_HERE.md',
  'docs/WHAT-PEAC-STANDARDIZES.md',
  'docs/HOW-IT-WORKS.md',
  'docs/ARTIFACTS.md',
  'docs/WHERE-IT-FITS.md',
  'docs/README_LONG.md',
];

// Tier-(c) phrases that are forbidden as leading framing.
const FORBIDDEN_PHRASES = ['evidence plane', 'evidence floor', 'portable signed evidence floor'];

// Context markers that legitimize a tier-(c) phrase (anti-absorption
// doctrine, threat-model internals, explicit historical marker).
// Matches are case-insensitive substring checks; include both spaced and
// hyphenated forms where applicable.
const LEGITIMIZING_MARKERS = [
  'anti-absorption',
  'deep architecture',
  'deep-architecture',
  'deeper architecture',
  'threat model',
  'historical',
  'previously called',
  'deep section',
  'not the top-line',
  'not the default',
  'vocabulary, not',
];

const TOP_N_LINES = 80;

describe('v0.13.0 records-first doctrine (top 80 lines)', () => {
  for (const rel of FRONT_DOOR_DOCS) {
    const abs = join(ROOT, rel);

    it(`${rel} exists`, () => {
      expect(existsSync(abs), `${rel} missing`).toBe(true);
    });

    it(`${rel} top ${TOP_N_LINES} lines contain no unlegitimized tier-(c) phrase`, () => {
      if (!existsSync(abs)) return;
      const content = readFileSync(abs, 'utf8');
      const top = content.split('\n').slice(0, TOP_N_LINES).join('\n');
      const lower = top.toLowerCase();

      const findings: string[] = [];
      for (const phrase of FORBIDDEN_PHRASES) {
        const needle = phrase.toLowerCase();
        let idx = lower.indexOf(needle);
        while (idx !== -1) {
          // Look for a legitimizing marker within 200 characters of the hit.
          const windowStart = Math.max(0, idx - 200);
          const windowEnd = Math.min(lower.length, idx + needle.length + 200);
          const contextWindow = lower.slice(windowStart, windowEnd);
          const hasMarker = LEGITIMIZING_MARKERS.some((m) => contextWindow.includes(m));
          if (!hasMarker) {
            // Line number for the finding.
            const prefix = content.slice(0, idx);
            const lineNo = prefix.split('\n').length;
            findings.push(`${rel}:${lineNo} "${phrase}" without legitimizing marker`);
          }
          idx = lower.indexOf(needle, idx + needle.length);
        }
      }

      expect(findings, findings.join('\n')).toEqual([]);
    });
  }
});
