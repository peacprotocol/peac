/**
 * Types for the local record verifier. App-local; NOT Wire 0.2; NOT a package export.
 */
import type { Wire02Claims } from '@peac/schema';
import type { VerifierErrorCode } from './errors.js';

// ---------------------------------------------------------------- context

export interface VerificationContextV1 {
  readonly contextVersion: '1';
  /** The ONLY independent trust anchor. Supplied out of band, never read from the record. */
  readonly trust?: { readonly trustedJwkThumbprints: readonly string[] };
  /** Claim/routing constraints over attacker-controllable payload values. Set semantics. */
  readonly constraints?: {
    readonly expectedIssuer?: string;
    readonly allowedKids?: readonly string[];
    readonly allowedRecordTypes?: readonly string[];
  };
}

// ------------------------------------------------------------------ input

/**
 * RAW DOCUMENTS ONLY.
 *
 * The verifier parses, normalizes and hashes the context itself: a caller-supplied
 * { value, sha256 } pair is structurally forgeable in TypeScript, so pairing one context with
 * another context's digest could not be prevented at the boundary.
 *
 * The build identifier is deliberately absent -- it is an environment dependency supplied at
 * initialization, so a caller cannot label a report with a build it did not produce.
 */
export interface VerifyWithSuppliedKeyInput {
  readonly record: string;
  readonly keyDocument: string;
  readonly contextDocument?: string;
  readonly evaluationTimeUnixSeconds: number;
  readonly maxClockSkewSeconds?: number;
}

// ----------------------------------------------------------------- states

export type SignatureResult =
  | 'valid_under_supplied_key'
  | 'invalid_under_supplied_key'
  | 'not_evaluated';
export type RecordValidationResult = 'valid' | 'invalid' | 'not_evaluated';

/**
 * FOUR states. `not_evaluated` (the expectation exists but an earlier phase stopped) is distinct
 * from `not_provided` (no such expectation was supplied). A three-value type cannot express
 * "supplied, but processing never reached this stage".
 */
export type ExpectationResult = 'matched' | 'mismatched' | 'not_provided' | 'not_evaluated';

export type FailureStage =
  | 'input'
  | 'key_selection'
  | 'signature'
  | 'record_validation_pre_signature'
  | 'record_validation_post_signature'
  | 'trusted_key'
  | 'constraints'
  | 'internal_error';

/** Stages that can appear in a report. Input and key-selection failures produce none. */
export type ReportFailureStage = Exclude<FailureStage, 'input' | 'key_selection'>;

export type UiMode = 'integrity-only' | 'constraints-checked' | 'trusted-key';

// ----------------------------------------------------------------- report

export interface VerificationReportCoreV1 {
  readonly reportVersion: '1';
  readonly verifierProfile: 'peac.local-record-verification.v1';
  readonly verifierBuild: string;
  readonly recordSha256: string;
  readonly selectedJwkThumbprint: string;
  readonly protectedKid?: string;
  readonly selectedJwkKid?: string;
  readonly verificationContextSha256?: string;
  readonly evaluationTimeUnixSeconds: number;
  readonly maxClockSkewSeconds: number;
  readonly signatureResult: SignatureResult;
  readonly recordValidationResult: RecordValidationResult;
  readonly trustedKeyResult: ExpectationResult;
  readonly issuerConstraintResult: ExpectationResult;
  readonly kidConstraintResult: ExpectationResult;
  readonly recordTypeConstraintResult: ExpectationResult;
  readonly outcome: 'accepted' | 'rejected';
  readonly failureStage?: ReportFailureStage;
  readonly failureCode?: string;
  readonly recordType?: string;
  readonly reportedIssuer?: string;
  readonly warningCodes: readonly string[];
  readonly limitationCodes: readonly string[];
  readonly reportSha256: string;
}

/** Non-deterministic. Never canonicalized, never hashed, never presented as signed evidence. */
export interface VerificationRunMetadata {
  readonly generatedAt?: string;
}

// ------------------------------------------------------- discriminated result

interface FailureBase {
  readonly ok: false;
  readonly code: VerifierErrorCode | string;
  readonly message: string;
  /** Stable upstream code for local display. Never payload prose, key material or a claim value. */
  readonly diagnostic?: string;
}

export interface InputFailure extends FailureBase {
  readonly failureStage: 'input';
  readonly report?: undefined;
}

export interface KeySelectionFailure extends FailureBase {
  readonly failureStage: 'key_selection';
  readonly report?: undefined;
}

export interface CapabilityFailure {
  readonly ok: false;
  readonly capability: 'ed25519_unsupported';
  readonly message: string;
  readonly report?: undefined;
}

export interface SignatureFailure extends FailureBase {
  readonly failureStage: 'signature';
  readonly signature: 'invalid_under_supplied_key';
  readonly recordValidation: 'not_evaluated';
  readonly trustedKey: 'not_evaluated';
  readonly issuerConstraint: 'not_evaluated';
  readonly kidConstraint: 'not_evaluated';
  readonly recordTypeConstraint: 'not_evaluated';
  readonly claimTruth: 'not_evaluated';
  readonly report: VerificationReportCoreV1;
}

export interface RecordValidationPreSignatureFailure extends FailureBase {
  readonly failureStage: 'record_validation_pre_signature';
  readonly signature: 'not_evaluated';
  readonly recordValidation: 'invalid';
  readonly trustedKey: 'not_evaluated';
  readonly issuerConstraint: 'not_evaluated';
  readonly kidConstraint: 'not_evaluated';
  readonly recordTypeConstraint: 'not_evaluated';
  readonly claimTruth: 'not_evaluated';
  readonly report: VerificationReportCoreV1;
}

export interface RecordValidationPostSignatureFailure extends FailureBase {
  readonly failureStage: 'record_validation_post_signature';
  readonly signature: 'valid_under_supplied_key';
  readonly recordValidation: 'invalid';
  readonly trustedKey: 'not_evaluated';
  readonly issuerConstraint: 'not_evaluated';
  readonly kidConstraint: 'not_evaluated';
  readonly recordTypeConstraint: 'not_evaluated';
  readonly claimTruth: 'not_evaluated';
  readonly report: VerificationReportCoreV1;
}

export interface ExpectationFailure extends FailureBase {
  readonly failureStage: 'trusted_key' | 'constraints';
  readonly signature: 'valid_under_supplied_key';
  readonly recordValidation: 'valid';
  readonly trustedKey: ExpectationResult;
  readonly issuerConstraint: ExpectationResult;
  readonly kidConstraint: ExpectationResult;
  readonly recordTypeConstraint: ExpectationResult;
  readonly claimTruth: 'not_evaluated';
  readonly report: VerificationReportCoreV1;
}

/** Fails closed: an internal error may never assert that the signature or record was valid. */
export interface InternalError extends FailureBase {
  readonly failureStage: 'internal_error';
  readonly code: 'E_VERIFIER_INTERNAL_ERROR' | 'E_VERIFIER_UNMAPPED_CANONICAL_CODE';
  readonly signature: 'not_evaluated';
  readonly recordValidation: 'not_evaluated';
  readonly trustedKey: 'not_evaluated';
  readonly issuerConstraint: 'not_evaluated';
  readonly kidConstraint: 'not_evaluated';
  readonly recordTypeConstraint: 'not_evaluated';
  readonly claimTruth: 'not_evaluated';
  readonly report?: VerificationReportCoreV1;
}

/** Claims exist on this variant and NOWHERE else. */
export interface VerificationSuccess {
  readonly ok: true;
  readonly outcome: 'accepted';
  readonly mode: UiMode;
  readonly signature: 'valid_under_supplied_key';
  readonly recordValidation: 'valid';
  readonly trustedKey: 'matched' | 'not_provided';
  readonly issuerConstraint: 'matched' | 'not_provided';
  readonly kidConstraint: 'matched' | 'not_provided';
  readonly recordTypeConstraint: 'matched' | 'not_provided';
  readonly claimTruth: 'not_evaluated';
  readonly claims: Wire02Claims;
  readonly protectedKid?: string;
  readonly selectedJwkThumbprint: string;
  readonly report: VerificationReportCoreV1;
}

export type BrowserVerificationResult =
  | InputFailure
  | KeySelectionFailure
  | CapabilityFailure
  | SignatureFailure
  | RecordValidationPreSignatureFailure
  | RecordValidationPostSignatureFailure
  | ExpectationFailure
  | InternalError
  | VerificationSuccess;
