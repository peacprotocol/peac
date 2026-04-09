/**
 * Ambient type declarations for @peac/core (deprecated compat-only package).
 *
 * @peac/core may not emit .d.ts files reliably in CI. This file provides
 * the minimal type surface needed by the legacy verifier.ts so that
 * typecheck:apps can run as a blocking CI gate.
 *
 * Remove this file when apps/api/src/verifier.ts is migrated away from
 * @peac/core (tracked: @peac/core removal target is v0.13.0).
 */
declare module '@peac/core' {
  export interface VerifyKeySet {
    [kid: string]: Uint8Array;
  }

  export interface VerifyResult {
    valid: boolean;
    claims?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    kid?: string;
    error?: string;
  }

  export function verifyReceipt(
    jws: string,
    keys: VerifyKeySet,
    options?: Record<string, unknown>
  ): Promise<VerifyResult>;

  export function canonicalPolicyHash(policy: unknown): Promise<string>;
}
