/**
 * Canonical error-code to verification-stage mapping.
 *
 * EXHAUSTIVE by construction. `satisfies Record<VerifyLocalErrorCode, CanonicalStage>` makes a
 * missing or extra key a COMPILE error. There is deliberately no default branch and no regex: a
 * catch-all that fell through to the post-signature stage would make the verifier assert
 * "signature valid under supplied key" for an unrecognised code, with no evidence for it.
 *
 * Stage boundaries are derived from the canonical verifier's own ordering: it verifies the
 * signature inside its codec call, and JOSE hardening plus wire-coherence checks run BEFORE that,
 * so those failures never reached signature evaluation.
 */
import type { VerifyLocalErrorCode } from '@peac/protocol/verify-local';

export type CanonicalStage =
  | 'signature'
  | 'record_validation_pre_signature'
  | 'record_validation_post_signature'
  | 'internal_error';

export const STAGE_BY_CODE = {
  E_INVALID_SIGNATURE: 'signature',

  E_INVALID_FORMAT: 'record_validation_pre_signature',
  E_JWS_EMBEDDED_KEY: 'record_validation_pre_signature',
  E_JWS_CRIT_REJECTED: 'record_validation_pre_signature',
  E_JWS_MISSING_KID: 'record_validation_pre_signature',
  E_JWS_B64_REJECTED: 'record_validation_pre_signature',
  E_JWS_ZIP_REJECTED: 'record_validation_pre_signature',
  E_IJSON_DUPLICATE_MEMBER_NAME: 'record_validation_pre_signature',
  E_IJSON_NUMBER_OUT_OF_RANGE: 'record_validation_pre_signature',
  E_IJSON_INVALID_STRING: 'record_validation_pre_signature',
  E_WIRE_VERSION_MISMATCH: 'record_validation_pre_signature',
  E_UNSUPPORTED_WIRE_VERSION: 'record_validation_pre_signature',

  E_CONSTRAINT_VIOLATION: 'record_validation_post_signature',
  E_EXPIRED: 'record_validation_post_signature',
  E_NOT_YET_VALID: 'record_validation_post_signature',
  E_INVALID_ISSUER: 'record_validation_post_signature',
  E_INVALID_AUDIENCE: 'record_validation_post_signature',
  E_INVALID_SUBJECT: 'record_validation_post_signature',
  E_INVALID_RECEIPT_ID: 'record_validation_post_signature',
  E_MISSING_EXP: 'record_validation_post_signature',
  E_OCCURRED_AT_FUTURE: 'record_validation_post_signature',
  E_POLICY_BINDING_FAILED: 'record_validation_post_signature',
  E_EXTENSION_GROUP_REQUIRED: 'record_validation_post_signature',
  E_EXTENSION_GROUP_MISMATCH: 'record_validation_post_signature',

  E_INTERNAL: 'internal_error',
} satisfies Record<VerifyLocalErrorCode, CanonicalStage>;

/**
 * Look up a stage. An unmapped code returns undefined so the caller can fail CLOSED at the
 * internal-error stage; it must never be treated as a post-signature validation failure.
 */
export function stageForCanonicalCode(code: string): CanonicalStage | undefined {
  return (STAGE_BY_CODE as Record<string, CanonicalStage>)[code];
}
