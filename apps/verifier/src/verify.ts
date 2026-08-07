/**
 * Local record verification -- the single-authority orchestrator.
 *
 * The canonical verifier decides PEAC record validity and is called EXACTLY ONCE, after key
 * selection. There is deliberately no second cryptographic verification of user input: an earlier
 * design ran a "preliminary" check first, but that invoked the same primitive the canonical
 * verifier uses internally, so it provided no independent assurance while doubling the work and
 * adding a reconciliation matrix and misleading inconsistency semantics.
 */
import './lib/schema-runtime.js';
import { sha256Hex } from '@peac/crypto';
import { verifyLocal as verifyLocalImpl } from '@peac/protocol/verify-local';
import { VerifierError, isVerifierError, DIAGNOSTIC } from './lib/errors.js';

/**
 * Codes that describe a VERIFIER fault rather than an input fault. They are never reported at a
 * user-facing stage, whatever phase raises them.
 */
const INTERNAL_CODES: ReadonlySet<string> = new Set([
  'E_VERIFIER_INTERNAL_ERROR',
  'E_VERIFIER_UNMAPPED_CANONICAL_CODE',
]);
import {
  DEFAULT_MAX_CLOCK_SKEW_SECONDS,
  MAX_CLOCK_SKEW_SECONDS_LIMIT,
  MAX_RECORD_BYTES,
  MAX_VERIFIER_BUILD_BYTES,
} from './lib/limits.js';
import { parseVerificationContext, type ParsedContext } from './lib/context.js';
import {
  parseKeyDocument,
  selectFromKeySet,
  selectSoleKey,
  withProtectedKid,
  type SelectedKey,
} from './lib/public-key.js';
import { readProtectedKidForRouting, isRoutingFailure } from './lib/protected-kid.js';
import { LIMITATION, buildReportCore, type ReportCoreDraft } from './lib/report.js';
import { ed25519WebCryptoSupported } from './lib/runtime-support.js';
import { stageForCanonicalCode } from './lib/stage-map.js';
import { assertNoLoneSurrogates, utf8ByteLength } from './lib/strict-json.js';
import type {
  BrowserVerificationResult,
  ExpectationResult,
  UiMode,
  VerificationReportCoreV1,
  VerifyWithSuppliedKeyInput,
} from './lib/verifier-types.js';

export interface LocalVerifier {
  readonly supported: boolean;
  verify(input: VerifyWithSuppliedKeyInput): Promise<BrowserVerificationResult>;
}

// --------------------------------------------------------------- validation

/**
 * The build identifier is recorded verbatim in every deterministic report, so it is validated
 * exactly and never normalized.
 *
 * The pattern matches the resolver's, so a value the resolver produces or accepts is a value this
 * constructor accepts. Whitespace, newlines and control characters are REJECTED rather than
 * stripped: trimming would silently record an identifier different from the one supplied, and a
 * newline inside a reproducible artifact corrupts anything that reads it line by line. Malformed
 * UTF-16 cannot appear in a value matching this alphabet, so it is rejected by the same test.
 */
const VERIFIER_BUILD_PATTERN = /^[A-Za-z0-9._:+/-]{1,128}$/;

function assertVerifierBuild(build: string): void {
  if (typeof build !== 'string' || build.length === 0) {
    throw new VerifierError('E_VERIFIER_BUILD_INVALID', 'verifier build identifier is required');
  }
  if (build.length > MAX_VERIFIER_BUILD_BYTES) {
    throw new VerifierError(
      'E_VERIFIER_BUILD_INVALID',
      'verifier build identifier exceeds the size limit'
    );
  }
  if (!VERIFIER_BUILD_PATTERN.test(build)) {
    throw new VerifierError(
      'E_VERIFIER_BUILD_INVALID',
      'verifier build identifier must match ^[A-Za-z0-9._:+/-]{1,128}$; ' +
        'whitespace, newlines and control characters are rejected, not stripped'
    );
  }
}

/**
 * Deterministic-time inputs must be bounded safe integers.
 *
 * Unvalidated JS numbers admit NaN, Infinity, fractions, negatives and an unbounded skew, which
 * break determinism, break JCS canonicalization of the report core, and can disable temporal
 * validation while still producing a confident-looking result.
 */
function assertNumericInputs(evaluationTimeUnixSeconds: number, maxClockSkewSeconds: number): void {
  if (!Number.isSafeInteger(evaluationTimeUnixSeconds) || evaluationTimeUnixSeconds < 0) {
    throw new VerifierError(
      'E_VERIFIER_TIME_INVALID',
      'evaluation time must be a non-negative safe integer'
    );
  }
  if (
    !Number.isSafeInteger(maxClockSkewSeconds) ||
    maxClockSkewSeconds < 0 ||
    maxClockSkewSeconds > MAX_CLOCK_SKEW_SECONDS_LIMIT
  ) {
    throw new VerifierError(
      'E_VERIFIER_SKEW_INVALID',
      'clock skew must be a safe integer within the locked ceiling'
    );
  }
}

function assertRecordInput(record: string): void {
  if (record.length === 0) {
    throw new VerifierError('E_VERIFIER_INPUT_EMPTY', 'no record supplied');
  }
  // NOT trimmed: the record digest is over the exact accepted bytes, so surrounding whitespace is a
  // different input and must be rejected rather than silently normalized.
  if (record !== record.trim()) {
    throw new VerifierError('E_VERIFIER_RECORD_WHITESPACE', 'record has surrounding whitespace');
  }
  assertNoLoneSurrogates(record, 'E_VERIFIER_RECORD_MALFORMED');
  if (utf8ByteLength(record) > MAX_RECORD_BYTES) {
    throw new VerifierError('E_VERIFIER_RECORD_TOO_LARGE', 'record exceeds the size limit');
  }
}

// ------------------------------------------------------------ result helpers

const ALL_NOT_EVALUATED = {
  trustedKey: 'not_evaluated',
  issuerConstraint: 'not_evaluated',
  kidConstraint: 'not_evaluated',
  recordTypeConstraint: 'not_evaluated',
  claimTruth: 'not_evaluated',
} as const;

function limitationsFor(e: Record<string, ExpectationResult>): string[] {
  const out: string[] = [LIMITATION.CLAIM_TRUTH_NOT_EVALUATED, LIMITATION.REPORT_IS_UNSIGNED];
  if (e.trustedKey !== 'matched') out.push(LIMITATION.KEY_NOT_INDEPENDENTLY_TRUSTED);
  if (e.issuerConstraint === 'not_provided') out.push(LIMITATION.ISSUER_CONSTRAINT_NOT_PROVIDED);
  if (e.kidConstraint === 'not_provided') out.push(LIMITATION.KID_CONSTRAINT_NOT_PROVIDED);
  if (e.recordTypeConstraint === 'not_provided')
    out.push(LIMITATION.RECORD_TYPE_CONSTRAINT_NOT_PROVIDED);
  return out;
}

type ReportBase = Omit<
  ReportCoreDraft,
  | 'signatureResult'
  | 'recordValidationResult'
  | 'trustedKeyResult'
  | 'issuerConstraintResult'
  | 'kidConstraintResult'
  | 'recordTypeConstraintResult'
  | 'outcome'
  | 'failureStage'
  | 'failureCode'
  | 'recordType'
  | 'reportedIssuer'
  | 'warningCodes'
  | 'limitationCodes'
>;

async function rejectedReport(
  base: ReportBase,
  stage: NonNullable<VerificationReportCoreV1['failureStage']>,
  code: string,
  signature: VerificationReportCoreV1['signatureResult'],
  recordValidation: VerificationReportCoreV1['recordValidationResult'],
  expectations: Record<string, ExpectationResult>,
  warningCodes: readonly string[] = []
): Promise<VerificationReportCoreV1> {
  return buildReportCore({
    ...base,
    signatureResult: signature,
    recordValidationResult: recordValidation,
    trustedKeyResult: expectations.trustedKey,
    issuerConstraintResult: expectations.issuerConstraint,
    kidConstraintResult: expectations.kidConstraint,
    recordTypeConstraintResult: expectations.recordTypeConstraint,
    outcome: 'rejected',
    failureStage: stage,
    failureCode: code,
    warningCodes,
    limitationCodes: limitationsFor(expectations),
  });
}

// ------------------------------------------------------------- orchestration

/**
 * Create a verifier.
 *
 * ASYNC because the WebCrypto capability probe is async. The probe runs before any user input is
 * accepted; an unsupported runtime yields a verifier that processes nothing and produces no report.
 */
export async function initializeLocalVerifier(env: {
  readonly verifierBuild: string;
  readonly verifyLocal?: typeof verifyLocalImpl;
}): Promise<LocalVerifier> {
  assertVerifierBuild(env.verifierBuild);
  const verifyLocal = env.verifyLocal ?? verifyLocalImpl;
  const supported = await ed25519WebCryptoSupported();

  /**
   * Total boundary: this function RESOLVES for every input, including an unexpected internal throw.
   *
   * Without it, a defect anywhere after the canonical call rejects the promise. The caller's `.then`
   * never runs, no result and no report are produced, and the interface simply stops responding --
   * a silent failure that is indistinguishable from a hang and tells the operator nothing. An
   * internal error must be a REPORTED outcome, not an absence of one.
   */
  async function verify(input: VerifyWithSuppliedKeyInput): Promise<BrowserVerificationResult> {
    // REPORT ELIGIBILITY, stated once and enforced here:
    //   1. before key selection succeeds        -> no report can exist (no selected key to name)
    //   2. after a complete report base exists  -> an internal error still yields a schema-valid
    //                                              REJECTED report, because the operator has a right
    //                                              to a deterministic record of what was evaluated
    //   3. if report construction ITSELF fails  -> a catastrophic internal result with no report and
    //                                              no claims; never a partial or hand-made report
    const carrier: { base?: ReportBase } = {};
    try {
      return await verifyInner(input, carrier);
    } catch (e) {
      const diagnostic = e instanceof Error ? e.name : 'unknown';
      const shell = {
        ok: false as const,
        failureStage: 'internal_error' as const,
        code: 'E_VERIFIER_INTERNAL_ERROR' as const,
        signature: 'not_evaluated' as const,
        recordValidation: 'not_evaluated' as const,
        ...ALL_NOT_EVALUATED,
      };

      if (carrier.base === undefined) {
        // Rule 1: nothing identifies a verification yet, so no report may be fabricated.
        return {
          ...shell,
          message: 'the verifier failed unexpectedly before a verification could be identified',
          diagnostic,
        };
      }

      try {
        // Rule 2.
        return {
          ...shell,
          message: 'the verifier failed unexpectedly; no verification outcome was established',
          diagnostic,
          report: await rejectedReport(
            carrier.base,
            'internal_error',
            'E_VERIFIER_INTERNAL_ERROR',
            'not_evaluated',
            'not_evaluated',
            ALL_NOT_EVALUATED
          ),
        };
      } catch {
        // Rule 3. A report that cannot be constructed must not be approximated.
        return {
          ...shell,
          message:
            'the verifier failed unexpectedly and could not produce a deterministic report; ' +
            'no verification outcome was established',
          diagnostic: DIAGNOSTIC.REPORT_CONSTRUCTION_FAILED,
        };
      }
    }
  }

  async function verifyInner(
    input: VerifyWithSuppliedKeyInput,
    carrier: { base?: ReportBase }
  ): Promise<BrowserVerificationResult> {
    if (!supported) {
      // An application-capability state, NOT an input failure. No record, key or context is
      // processed and no report is produced.
      return {
        ok: false,
        capability: 'ed25519_unsupported',
        message:
          'This browser cannot perform the Ed25519 verification profile required by PEAC. ' +
          'Use a current browser, or verify with the PEAC CLI.',
      };
    }

    const skew = input.maxClockSkewSeconds ?? DEFAULT_MAX_CLOCK_SKEW_SECONDS;

    // ---- phase 1: input validation --------------------------------------
    let keys;
    let context: ParsedContext | undefined;
    try {
      assertNumericInputs(input.evaluationTimeUnixSeconds, skew);
      assertRecordInput(input.record);
      keys = parseKeyDocument(input.keyDocument);
      if (input.contextDocument !== undefined) {
        context = await parseVerificationContext(input.contextDocument);
      }
    } catch (e) {
      // ONLY a bounded VerifierError is a user-facing input failure. A programmer error or a
      // dependency defect is NOT the user's input being wrong, and reporting it as `input` would
      // tell the operator to go and fix a perfectly good record. Rethrow to the total boundary.
      if (!isVerifierError(e)) throw e;
      return {
        ok: false,
        failureStage: 'input',
        code: e.code,
        message: e.message,
        diagnostic: e.diagnostic,
      };
    }

    // ---- phase 2: routing + deterministic key selection -------------------
    // With exactly one validated key there is nothing to disambiguate, so the protected header is
    // NOT read here. That lets a malformed header reach the canonical verifier and be reported
    // under its canonical code instead of failing at the routing boundary.
    let selected: SelectedKey;
    // Whether routing was ABLE to read the protected header at all. `protectedKid === undefined`
    // is ambiguous on its own -- it means either "the header carries no kid" or "routing could not
    // read the header". Only the first is a legitimate basis for evaluating a kid constraint.
    let routingReadTheHeader = true;
    try {
      if (keys.length === 1) {
        selected = await selectSoleKey(keys);
        try {
          selected = withProtectedKid(selected, readProtectedKidForRouting(input.record));
        } catch (e) {
          // Swallow ONLY the documented routing failures. An unqualified `catch {}` here would also
          // absorb programmer errors and invariant violations, turning a real defect into a silently
          // degraded verification that still reports a confident outcome.
          if (!isRoutingFailure(e)) throw e;
          // Routing is optional on this path: the sole key is already chosen, and the canonical
          // verifier will classify whatever is wrong with the header under its own code.
          routingReadTheHeader = false;
        }
      } else {
        selected = await selectFromKeySet(keys, readProtectedKidForRouting(input.record));
      }
    } catch (e) {
      // Same rule as the input phase: an unknown exception is never a key-selection failure.
      if (!isVerifierError(e)) throw e;
      // An INTERNAL code is bounded in type but not in meaning: it says the verifier misbehaved, not
      // that the operator's key document is wrong. Reporting it at a user-facing stage would send
      // them to fix something that is not broken.
      if (INTERNAL_CODES.has(e.code)) throw e;
      const err = e;
      // A malformed record is an INPUT defect; anything else at this point is key selection.
      // Branch explicitly so each variant keeps its literal failureStage.
      if (err.code === 'E_VERIFIER_RECORD_MALFORMED' || err.code.startsWith('E_IJSON_')) {
        return {
          ok: false,
          failureStage: 'input',
          code: err.code,
          message: err.message,
          diagnostic: err.diagnostic,
        };
      }
      return {
        ok: false,
        failureStage: 'key_selection',
        code: err.code,
        message: err.message,
        diagnostic: err.diagnostic,
      };
    }

    // A report is eligible from here: key selection succeeded.
    const base: ReportBase = {
      reportVersion: '1',
      verifierProfile: 'peac.local-record-verification.v1',
      verifierBuild: env.verifierBuild,
      recordSha256: `sha256:${await sha256Hex(input.record)}`,
      selectedJwkThumbprint: selected.jwkThumbprint,
      ...(selected.protectedKid !== undefined ? { protectedKid: selected.protectedKid } : {}),
      ...(selected.selectedJwkKid !== undefined ? { selectedJwkKid: selected.selectedJwkKid } : {}),
      ...(context !== undefined ? { verificationContextSha256: context.sha256 } : {}),
      evaluationTimeUnixSeconds: input.evaluationTimeUnixSeconds,
      maxClockSkewSeconds: skew,
    };
    // Rule 2 above: from this point an internal error still owes the operator a report.
    carrier.base = base;

    // ---- phase 3: canonical verification, EXACTLY ONCE --------------------
    const r = await verifyLocal(input.record, selected.publicKeyBytes, {
      now: input.evaluationTimeUnixSeconds,
      maxClockSkew: skew,
      strictness: 'strict',
    });

    // ---- phase 4: exhaustive canonical stage mapping ----------------------
    if (!r.valid) {
      const stage = stageForCanonicalCode(r.code);
      if (stage === undefined || stage === 'internal_error') {
        const code =
          stage === undefined ? 'E_VERIFIER_UNMAPPED_CANONICAL_CODE' : 'E_VERIFIER_INTERNAL_ERROR';
        return {
          ok: false,
          failureStage: 'internal_error',
          code,
          message: 'the verifier could not classify the canonical result',
          diagnostic: r.code,
          signature: 'not_evaluated',
          recordValidation: 'not_evaluated',
          ...ALL_NOT_EVALUATED,
          report: await rejectedReport(
            base,
            'internal_error',
            code,
            'not_evaluated',
            'not_evaluated',
            ALL_NOT_EVALUATED
          ),
        };
      }
      if (stage === 'signature') {
        return {
          ok: false,
          failureStage: 'signature',
          code: r.code,
          message: r.message,
          signature: 'invalid_under_supplied_key',
          recordValidation: 'not_evaluated',
          ...ALL_NOT_EVALUATED,
          report: await rejectedReport(
            base,
            'signature',
            r.code,
            'invalid_under_supplied_key',
            'not_evaluated',
            ALL_NOT_EVALUATED
          ),
        };
      }
      const sig =
        stage === 'record_validation_pre_signature' ? 'not_evaluated' : 'valid_under_supplied_key';
      return {
        ok: false,
        failureStage: stage,
        code: r.code,
        message: r.message,
        signature: sig,
        recordValidation: 'invalid',
        ...ALL_NOT_EVALUATED,
        report: await rejectedReport(base, stage, r.code, sig, 'invalid', ALL_NOT_EVALUATED),
      } as BrowserVerificationResult;
    }

    // ---- phases 5-6: trust, then claim constraints ------------------------
    const trustedKey: ExpectationResult = context?.value.trust
      ? context.value.trust.trustedJwkThumbprints.includes(selected.jwkThumbprint)
        ? 'matched'
        : 'mismatched'
      : 'not_provided';

    const c = context?.value.constraints;
    const issuerConstraint: ExpectationResult = c?.expectedIssuer
      ? r.claims.iss === c.expectedIssuer
        ? 'matched'
        : 'mismatched'
      : 'not_provided';
    // protectedKid ONLY. The JWK member kid is local metadata and is never compared here.
    // STRUCTURAL BACKSTOP. The one known unit divergence between this routing parser and
    // validateWire02Header (characters vs bytes) is closed at source in limits.ts. But "no divergence
    // exists" is a negative over all inputs and cannot be proven by enumeration, so the unsound state
    // is made unrepresentable instead: if a kid constraint was supplied and routing could not read
    // the header, the constraint is NOT evaluable -- and reporting `mismatched` would assert an
    // inequality that was never tested. Fail closed.
    if (c?.allowedKids && !routingReadTheHeader) {
      const code = 'E_VERIFIER_INTERNAL_ERROR' as const;
      return {
        ok: false,
        failureStage: 'internal_error',
        code,
        // The DIVERGENCE is carried as a bounded app-local diagnostic, never as a public error code:
        // the report schema admits exactly two internal-error codes, and inventing a third would
        // emit a schema-invalid report.
        diagnostic: DIAGNOSTIC.ROUTING_CANONICAL_DIVERGENCE,
        message:
          'the protected header could not be read for routing, yet canonical verification succeeded; ' +
          'a supplied kid constraint cannot be evaluated against an unread header',
        signature: 'not_evaluated',
        recordValidation: 'not_evaluated',
        ...ALL_NOT_EVALUATED,
        report: await rejectedReport(
          base,
          'internal_error',
          code,
          'not_evaluated',
          'not_evaluated',
          ALL_NOT_EVALUATED
        ),
      };
    }
    const kidConstraint: ExpectationResult = c?.allowedKids
      ? selected.protectedKid !== undefined && c.allowedKids.includes(selected.protectedKid)
        ? 'matched'
        : 'mismatched'
      : 'not_provided';
    const recordTypeConstraint: ExpectationResult = c?.allowedRecordTypes
      ? c.allowedRecordTypes.includes(r.claims.type)
        ? 'matched'
        : 'mismatched'
      : 'not_provided';

    const expectations = {
      trustedKey,
      issuerConstraint,
      kidConstraint,
      recordTypeConstraint,
      claimTruth: 'not_evaluated' as const,
    };
    // VerifyLocalSuccess declares `warnings: VerificationWarning[]` non-optionally
    // (packages/protocol/src/verify-local.ts:13), so this coalesce is unreachable today. It is kept
    // because the declaration is a compile-time claim about a package this app does not own: if a
    // future revision ever makes it optional, the failure here would otherwise be a TypeError thrown
    // AFTER a successful verification, which is the worst possible moment to lose the result.
    const warningCodes = (r.warnings ?? []).map((w) => w.code);

    // Deterministic precedence: trusted key > issuer > protected kid > record type. Result fields
    // still report EVERY evaluated mismatch; only the stage and code follow this order.
    const precedence: ReadonlyArray<
      readonly [ExpectationResult, 'trusted_key' | 'constraints', string]
    > = [
      [trustedKey, 'trusted_key', 'E_VERIFIER_TRUSTED_KEY_MISMATCH'],
      [issuerConstraint, 'constraints', 'E_VERIFIER_ISSUER_MISMATCH'],
      [kidConstraint, 'constraints', 'E_VERIFIER_KID_MISMATCH'],
      [recordTypeConstraint, 'constraints', 'E_VERIFIER_RECORD_TYPE_MISMATCH'],
    ];
    const hit = precedence.find(([result]) => result === 'mismatched');
    if (hit) {
      const [, stage, code] = hit;
      return {
        ok: false,
        failureStage: stage,
        code,
        message: 'a supplied verification expectation did not match',
        signature: 'valid_under_supplied_key',
        recordValidation: 'valid',
        ...expectations,
        report: await rejectedReport(
          base,
          stage,
          code,
          'valid_under_supplied_key',
          'valid',
          expectations,
          warningCodes
        ),
      };
    }

    // ---- phase 7: success + deterministic report --------------------------
    const mode: UiMode =
      trustedKey === 'matched'
        ? 'trusted-key'
        : c !== undefined
          ? 'constraints-checked'
          : 'integrity-only';

    const report = await buildReportCore({
      ...base,
      signatureResult: 'valid_under_supplied_key',
      recordValidationResult: 'valid',
      trustedKeyResult: trustedKey,
      issuerConstraintResult: issuerConstraint,
      kidConstraintResult: kidConstraint,
      recordTypeConstraintResult: recordTypeConstraint,
      outcome: 'accepted',
      recordType: r.claims.type,
      reportedIssuer: r.claims.iss,
      warningCodes,
      limitationCodes: limitationsFor(expectations),
    });

    return {
      ok: true,
      outcome: 'accepted',
      mode,
      signature: 'valid_under_supplied_key',
      recordValidation: 'valid',
      trustedKey: trustedKey as 'matched' | 'not_provided',
      issuerConstraint: issuerConstraint as 'matched' | 'not_provided',
      kidConstraint: kidConstraint as 'matched' | 'not_provided',
      recordTypeConstraint: recordTypeConstraint as 'matched' | 'not_provided',
      claimTruth: 'not_evaluated',
      claims: r.claims,
      ...(selected.protectedKid !== undefined ? { protectedKid: selected.protectedKid } : {}),
      selectedJwkThumbprint: selected.jwkThumbprint,
      report,
    };
  }

  return { supported, verify };
}
