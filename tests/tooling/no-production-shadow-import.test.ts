/**
 * Source-level guard: production protocol entry points MUST NOT
 * import or reference `runBoundedValidatorShadow`. The shadow function
 * is reserved for shadow / corpus / parity-harness consumers
 * (`runBoundedValidationGate` is the production wrapper).
 *
 * Scope:
 *   - packages/protocol/src/issue.ts
 *   - packages/protocol/src/verify-local.ts
 *   - packages/protocol/src/verify.ts
 *
 * The shadow function MAY appear inside an existing `scheduleShadow`
 * call body (issue.ts and verify-local.ts both schedule the bounded
 * validator under the rollback branch as a parity comparator). The
 * test enforces that no production entry point depends on the shadow
 * helper as the primary admission path; runtime gating is layered on
 * top by activation tests in
 * `packages/protocol/__tests__/_internal/bounded-default-runtime.test.ts`.
 *
 * Therefore the rule encoded here is the single static invariant:
 * the canonical production wrapper `runBoundedValidationGate` MUST
 * appear in the imports of every Wire 0.2 admission entry point and
 * MUST NOT appear in `verify.ts` (Wire 0.1 verifier; bounded
 * validation is out of scope per the v0.14.0 plan).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const ISSUE_FILE = join(ROOT, 'packages', 'protocol', 'src', 'issue.ts');
const VERIFY_LOCAL_FILE = join(ROOT, 'packages', 'protocol', 'src', 'verify-local.ts');
const VERIFY_FILE = join(ROOT, 'packages', 'protocol', 'src', 'verify.ts');

const PRODUCTION_GATE_IMPORT = /from\s+['"][^'"]*validation-gate(\.js)?['"]/;
const PRODUCTION_GATE_SYMBOL = /\brunBoundedValidationGate\b/;
const SHADOW_FN_SYMBOL = /\brunBoundedValidatorShadow\b/;

describe('production wrapper boundary: Wire 0.2 entry points use runBoundedValidationGate', () => {
  it('issue.ts imports the production gate wrapper', () => {
    const content = readFileSync(ISSUE_FILE, 'utf8');
    expect(PRODUCTION_GATE_IMPORT.test(content)).toBe(true);
    expect(PRODUCTION_GATE_SYMBOL.test(content)).toBe(true);
  });

  it('verify-local.ts imports the production gate wrapper', () => {
    const content = readFileSync(VERIFY_LOCAL_FILE, 'utf8');
    expect(PRODUCTION_GATE_IMPORT.test(content)).toBe(true);
    expect(PRODUCTION_GATE_SYMBOL.test(content)).toBe(true);
  });
});

describe('production wrapper boundary: verify.ts (Wire 0.1) does not reference the gate', () => {
  it('verify.ts does NOT import or reference runBoundedValidationGate', () => {
    const content = readFileSync(VERIFY_FILE, 'utf8');
    expect(PRODUCTION_GATE_IMPORT.test(content)).toBe(false);
    expect(PRODUCTION_GATE_SYMBOL.test(content)).toBe(false);
  });

  it('verify.ts does NOT reference runBoundedValidatorShadow', () => {
    const content = readFileSync(VERIFY_FILE, 'utf8');
    expect(SHADOW_FN_SYMBOL.test(content)).toBe(false);
  });
});
