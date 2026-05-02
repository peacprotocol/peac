/**
 * Source-level guard: the rollback-path flag MUST NOT appear as a
 * `void readLegacyPathFlag(...)` discard in the Wire 0.2 protocol
 * entry points. Both flag values must select genuinely different
 * admission paths in `issueWire02()` and `verifyLocal()`.
 *
 * Scope is intentional:
 *   - packages/protocol/src/issue.ts        (Wire 0.2 issuance)
 *   - packages/protocol/src/verify-local.ts (Wire 0.2 local verification)
 *
 * Out of scope:
 *   - packages/protocol/src/verify.ts is the Wire 0.1 verifier; the
 *     bounded validation gate is keyed on Wire 0.2 claim shapes and
 *     does not apply there. The flag-read symmetry invariant is
 *     deliberately not enforced for Wire 0.1.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const SCOPED_FILES = [
  join(ROOT, 'packages', 'protocol', 'src', 'issue.ts'),
  join(ROOT, 'packages', 'protocol', 'src', 'verify-local.ts'),
];

const FORBIDDEN_PATTERN = /void\s+readLegacyPathFlag\s*\(/;

describe('rollback-flag discard-pattern guard (Wire 0.2 admission paths only)', () => {
  for (const file of SCOPED_FILES) {
    it(`${file.replace(ROOT, '<repo>')}: must not contain "void readLegacyPathFlag(..."`, () => {
      const content = readFileSync(file, 'utf8');
      expect(FORBIDDEN_PATTERN.test(content)).toBe(false);
    });
  }
});
