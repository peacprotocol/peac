/**
 * Source-level guard: production gate boundary.
 *
 * The Wire 0.2 admission paths (`issue.ts` and `verify-local.ts`)
 * import `runBoundedValidationGate` and route their primary admission
 * step through it. The shadow function `runBoundedValidatorShadow`
 * remains available inside the existing `scheduleShadow` call bodies
 * as an observational parity comparator on the rollback branch; it
 * is not the primary admission path.
 *
 * The Wire 0.1 verifier (`verify.ts`) is intentionally out of scope:
 * the bounded validation gate is keyed on Wire 0.2 claim shapes and
 * does not apply to Wire 0.1.
 *
 * The static invariants enforced here:
 *
 *   1. `issue.ts` and `verify-local.ts` import the production gate
 *      wrapper and reference its symbol.
 *   2. `verify.ts` does not import the gate, does not reference its
 *      symbol, and does not reference the shadow function symbol.
 *
 * Runtime activation (the gate IS called on the default branch and is
 * NOT called on the rollback branch) is asserted separately in
 * `packages/protocol/__tests__/_internal/bounded-default-runtime.test.ts`.
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
  it('verify.ts does not import or reference runBoundedValidationGate', () => {
    const content = readFileSync(VERIFY_FILE, 'utf8');
    expect(PRODUCTION_GATE_IMPORT.test(content)).toBe(false);
    expect(PRODUCTION_GATE_SYMBOL.test(content)).toBe(false);
  });

  it('verify.ts does not reference runBoundedValidatorShadow', () => {
    const content = readFileSync(VERIFY_FILE, 'utf8');
    expect(SHADOW_FN_SYMBOL.test(content)).toBe(false);
  });
});
