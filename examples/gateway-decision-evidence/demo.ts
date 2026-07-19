/**
 * Gateway Decision Evidence
 *
 * A gateway decision boundary under an issuer's control issues a signed
 * org.peacprotocol/access-decision record ONLY for a terminal access decision it
 * can truthfully populate (allow/deny/review), and abstains for every
 * non-terminal state. A relying party verifies it offline under an explicit
 * issuer/key policy. Uses only the shipped access-decision record and the
 * registered org.peacprotocol/access extension; no new protocol surface. See
 * README.md for the full walkthrough.
 *
 * Trust boundary: parseGatewayBoundaryEvent validates event shape and the
 * explicit terminality claim only. It does NOT establish that the event
 * originated at a gateway decision boundary under the issuer's control; the
 * deployment must establish that provenance before the issuance path. A valid
 * signature proves record integrity and possession of the signing key, not
 * issuer legitimacy or authorization, which are configured trust-policy
 * decisions. issueTerminalAccessDecision enforces the terminal shape at both the
 * TypeScript and runtime boundaries (the TypeScript type prevents accidental
 * misuse in typed callers; a runtime guard also rejects malformed JavaScript or
 * cast inputs). Neither mechanism proves issuer-controlled provenance.
 *
 * Verification policy: the wrapper verifies the signature and expected issuer,
 * then requires the expected record kind and type, the access pillar, and a
 * valid access extension. The expected kid is enforced only when the policy
 * configures one; rejecting on a verification warning is a conservative,
 * example-local policy, NOT a PEAC or GDE requirement (the profile preserves
 * application-specific extensions as application data).
 *
 * occurred_at is never fabricated: a production gateway may set it from a trusted
 * boundary timestamp (Wire 0.2); this synthetic example omits it (it is optional).
 * Local values only: no network, no external services, no vendor SDK.
 *
 * Run: pnpm demo | pnpm demo:tamper | pnpm demo:show-record | pnpm test
 */

import {
  issue,
  verifyLocal,
  type VerifyLocalSuccess,
  type VerifyLocalErrorCode,
} from '@peac/protocol';
import { AccessExtensionSchema, ACCESS_EXTENSION_KEY } from '@peac/schema';
import { generateKeypair } from '@peac/crypto';

// Configuration (synthetic; no real deployment identified)
export const GATEWAY_ISSUER = 'https://gateway.example';
export const GATEWAY_KID = 'gateway-key-1';

/** The registered access-decision vocabulary. The ONLY decision values PEAC accepts. */
export type AccessDecision = 'allow' | 'deny' | 'review';
export type HandlingAction = 'log' | 'retry' | 'fallback' | 'continue' | 'transform';

/**
 * An observation from a gateway decision boundary, as a discriminated union.
 * Only the `terminal` variant carries an access decision, and it carries
 * `retryOrFallbackPossible: false` so that established terminality is a
 * type-level invariant. Every other variant is a non-issuable state by
 * construction.
 *
 * This type describes SHAPE and terminality only. It does not assert that the
 * value originated at a boundary under the issuer's control; that provenance is
 * a deployment precondition established outside this module.
 */
export type GatewayBoundaryObservation =
  | {
      kind: 'terminal';
      resource: string;
      action: string;
      decision: AccessDecision;
      retryOrFallbackPossible: false;
    }
  | { kind: 'check'; result: 'passed' | 'failed' | 'error' }
  | { kind: 'intermediate' }
  | { kind: 'handling-action'; action: HandlingAction }
  | { kind: 'third-party-report'; source: string };

/** The only issuable observation: a terminal access decision. */
export type TerminalGatewayAccessDecision = Extract<
  GatewayBoundaryObservation,
  { kind: 'terminal' }
>;

type AccessRecord = { resource: string; action: string; decision: AccessDecision };

export type MapResult =
  | { issuable: true; terminal: TerminalGatewayAccessDecision }
  | { issuable: false; reason: string };

const DECISIONS: ReadonlySet<string> = new Set<AccessDecision>(['allow', 'deny', 'review']);
const HANDLING: ReadonlySet<string> = new Set<HandlingAction>([
  'log',
  'retry',
  'fallback',
  'continue',
  'transform',
]);
const KINDS: ReadonlySet<string> = new Set([
  'terminal',
  'check',
  'intermediate',
  'handling-action',
  'third-party-report',
]);

function isNonBlankString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * SYNTAX-ONLY validation of a raw event into a GatewayBoundaryObservation, or a
 * non-issuable reason.
 *
 * PRECONDITION: this function validates event shape and the explicit terminality
 * claim only. It does NOT establish that the event originated at a gateway
 * decision boundary under the issuer's control. The deployment must establish
 * that provenance before the issuance path. Passing this check is not evidence
 * of issuer control, authority, or terminality beyond the explicit claim.
 *
 * Terminality is explicit: a raw terminal event is accepted only when
 * `retryOrFallbackPossible` is EXACTLY `false`. A missing, null, truthy, or
 * non-boolean value abstains. A non-terminal event carrying a `decision` field
 * is rejected as contradictory.
 */
export function parseGatewayBoundaryEvent(
  raw: unknown
): GatewayBoundaryObservation | { invalid: string } {
  if (typeof raw !== 'object' || raw === null) return { invalid: 'event is not an object' };
  const e = raw as Record<string, unknown>;
  const kind = e.kind;
  if (typeof kind !== 'string' || !KINDS.has(kind))
    return { invalid: `unknown event kind "${String(kind)}"` };

  // A non-terminal event must never carry an access decision.
  if (kind !== 'terminal' && 'decision' in e)
    return { invalid: `${kind} event must not carry a decision` };

  switch (kind) {
    case 'terminal': {
      if (e.retryOrFallbackPossible !== false)
        return {
          invalid: 'terminality not established (retryOrFallbackPossible must be exactly false)',
        };
      if (
        !isNonBlankString(e.resource) ||
        !isNonBlankString(e.action) ||
        typeof e.decision !== 'string'
      )
        return { invalid: 'missing required access context (resource/action/decision)' };
      if (!DECISIONS.has(e.decision)) return { invalid: `unsupported decision "${e.decision}"` };
      return {
        kind: 'terminal',
        resource: e.resource,
        action: e.action,
        decision: e.decision as AccessDecision,
        retryOrFallbackPossible: false,
      };
    }
    case 'check': {
      const result = e.result;
      if (result !== 'passed' && result !== 'failed' && result !== 'error')
        return { invalid: 'check event has an unsupported result' };
      return { kind: 'check', result };
    }
    case 'intermediate':
      return { kind: 'intermediate' };
    case 'handling-action': {
      const action = e.action;
      if (typeof action !== 'string' || !HANDLING.has(action))
        return { invalid: 'handling-action event has an unsupported action' };
      return { kind: 'handling-action', action: action as HandlingAction };
    }
    case 'third-party-report': {
      if (!isNonBlankString(e.source)) return { invalid: 'third-party-report missing source' };
      return { kind: 'third-party-report', source: e.source };
    }
    default:
      return { invalid: 'unreachable' };
  }
}

/**
 * Classify a boundary observation: a terminal decision is issuable and is
 * retained as a TerminalGatewayAccessDecision; every other variant abstains.
 */
export function toAccessDecision(observation: GatewayBoundaryObservation): MapResult {
  switch (observation.kind) {
    case 'terminal':
      return { issuable: true, terminal: observation };
    case 'check':
      return { issuable: false, reason: `check-only (${observation.result}); not a decision` };
    case 'intermediate':
      return { issuable: false, reason: 'intermediate; retry or fallback still possible' };
    case 'handling-action':
      return {
        issuable: false,
        reason: `handling-action-only (${observation.action}); not a terminal access decision`,
      };
    case 'third-party-report':
      return {
        issuable: false,
        reason: `third-party report only (${observation.source}); out of profile`,
      };
  }
}

/**
 * Runtime guard: return a validated TerminalGatewayAccessDecision, or throw.
 * TypeScript types are erased at runtime, so this also rejects malformed
 * JavaScript or cast inputs (a bare access object, a non-terminal kind, or a
 * terminal claim without retryOrFallbackPossible === false).
 */
function requireTerminalGatewayAccessDecision(value: unknown): TerminalGatewayAccessDecision {
  const parsed = parseGatewayBoundaryEvent(value);
  if ('invalid' in parsed || parsed.kind !== 'terminal')
    throw new TypeError(
      'a terminal gateway access decision with retryOrFallbackPossible=false is required'
    );
  return parsed;
}

export type IssueTerminalAccessDecisionParams = {
  issuer: string;
  privateKey: Uint8Array;
  kid: string;
  terminal: TerminalGatewayAccessDecision;
};

/**
 * Issue a signed org.peacprotocol/access-decision record. Enforces the terminal
 * shape at the TypeScript type AND at runtime, so a bare {resource, action,
 * decision} object cannot be issued.
 */
export async function issueTerminalAccessDecision(
  params: IssueTerminalAccessDecisionParams
): Promise<string> {
  const terminal = requireTerminalGatewayAccessDecision(params.terminal);
  const access: AccessRecord = AccessExtensionSchema.parse({
    resource: terminal.resource,
    action: terminal.action,
    decision: terminal.decision,
  });
  const { jws } = await issue({
    iss: params.issuer,
    kind: 'evidence',
    type: 'org.peacprotocol/access-decision',
    pillars: ['access'],
    extensions: { [ACCESS_EXTENSION_KEY]: access },
    privateKey: params.privateKey,
    kid: params.kid,
  });
  return jws;
}

/**
 * A relying party's configured acceptance policy.
 *
 * `expectedKid` is enforced only when the relying party pins one (PEAC's Trust
 * Pinning Policy also makes a pin kid optional). `rejectWarnings` is an OPTIONAL
 * conservative, example-local choice: PEAC preserves well-formed unknown
 * extensions with an informational warning and treats them as application data,
 * so rejecting on any warning is an application policy, not a PEAC or GDE
 * requirement.
 */
export type GatewayVerificationPolicy = {
  expectedIssuer: string;
  acceptedPublicKey: Uint8Array;
  expectedKid?: string;
  rejectWarnings?: boolean;
};

/** Verifier warning, derived from the shipped verifier contract (not re-declared). */
export type GatewayVerificationWarning = VerifyLocalSuccess['warnings'][number];

/** Verification failure reasons: shipped verifier codes plus this example's policy checks. */
export type GatewayVerificationFailureReason =
  | VerifyLocalErrorCode
  | 'unexpected_record_kind'
  | 'unexpected_record_type'
  | 'missing_access_pillar'
  | 'invalid_access_extension'
  | 'unexpected_kid'
  | 'unexpected_verification_warning';

export type VerifyOutcome =
  | {
      valid: true;
      decision: AccessDecision;
      kid: string;
      wireVersion: '0.2';
      warnings: readonly GatewayVerificationWarning[];
    }
  | { valid: false; reason: GatewayVerificationFailureReason };

/**
 * Profile-aware verification under an explicit relying-party policy. Verifies the
 * signature and expected issuer, then requires the expected record kind, type,
 * access pillar, and a valid access extension. The expected kid is enforced only
 * when configured; warnings are rejected only when the policy sets
 * `rejectWarnings: true`. Consumes the verifier's validated output (kid, warnings,
 * failure code) rather than re-decoding the JWS, and never throws. Verifier
 * failures retain their canonical codes (for example malformed input is
 * `E_INVALID_FORMAT`); an unexpected exception outside the verifier's normal
 * typed-result contract is reported as `E_INTERNAL`.
 */
export async function verifyGatewayDecision(
  jws: string,
  policy: GatewayVerificationPolicy
): Promise<VerifyOutcome> {
  let v;
  try {
    v = await verifyLocal(jws, policy.acceptedPublicKey, { issuer: policy.expectedIssuer });
  } catch {
    return { valid: false, reason: 'E_INTERNAL' };
  }
  if (!v.valid) return { valid: false, reason: v.code };

  const claims = v.claims as {
    kind?: string;
    type?: string;
    pillars?: string[];
    extensions?: Record<string, unknown>;
  };
  if (claims.kind !== 'evidence') return { valid: false, reason: 'unexpected_record_kind' };
  if (claims.type !== 'org.peacprotocol/access-decision')
    return { valid: false, reason: 'unexpected_record_type' };
  if (!Array.isArray(claims.pillars) || !claims.pillars.includes('access'))
    return { valid: false, reason: 'missing_access_pillar' };
  const parsed = AccessExtensionSchema.safeParse(claims.extensions?.[ACCESS_EXTENSION_KEY]);
  if (!parsed.success) return { valid: false, reason: 'invalid_access_extension' };
  if (policy.expectedKid !== undefined && v.kid !== policy.expectedKid)
    return { valid: false, reason: 'unexpected_kid' };
  if (policy.rejectWarnings === true && v.warnings.length !== 0)
    return { valid: false, reason: 'unexpected_verification_warning' };

  return {
    valid: true,
    decision: parsed.data.decision as AccessDecision,
    kid: v.kid,
    wireVersion: v.wireVersion,
    warnings: v.warnings,
  };
}

// These helpers decode compact JWS segments for display and deliberate tampering
// only. Their output is unverified and must never drive authorization or trust
// policy. They are intentionally not exported.
function b64urlToUtf8(seg: string): string {
  return Buffer.from(seg, 'base64url').toString('utf8');
}
function decodeJwsHeaderForDisplay(jws: string): Record<string, unknown> {
  return JSON.parse(b64urlToUtf8(jws.split('.')[0]));
}
function decodeJwsClaimsForDemo(jws: string): Record<string, unknown> {
  return JSON.parse(b64urlToUtf8(jws.split('.')[1]));
}

/** A terminal observation the synthetic issuer-controlled boundary produces. */
function terminal(
  resource: string,
  action: string,
  decision: AccessDecision
): TerminalGatewayAccessDecision {
  return { kind: 'terminal', resource, action, decision, retryOrFallbackPossible: false };
}

/** Synthetic boundary events covering the full matrix (raw, as an adapter might emit). */
export function sampleEvents(): Record<string, unknown> {
  return {
    'terminal allow': {
      kind: 'terminal',
      resource: 'https://api.internal.example/records/42',
      action: 'records.read',
      decision: 'allow',
      retryOrFallbackPossible: false,
    },
    'terminal deny': {
      kind: 'terminal',
      resource: 'https://api.internal.example/records/42',
      action: 'records.delete',
      decision: 'deny',
      retryOrFallbackPossible: false,
    },
    'terminal review': {
      kind: 'terminal',
      resource: 'https://api.internal.example/records/42',
      action: 'records.export',
      decision: 'review',
      retryOrFallbackPossible: false,
    },
    'check only': { kind: 'check', result: 'failed' },
    intermediate: { kind: 'intermediate' },
    'terminal label without established terminality': {
      kind: 'terminal',
      resource: 'https://x',
      action: 'records.read',
      decision: 'deny',
    },
    'handling action only': { kind: 'handling-action', action: 'retry' },
    'third-party report only': { kind: 'third-party-report', source: 'https://collector.example' },
    'missing action': {
      kind: 'terminal',
      resource: 'https://x',
      decision: 'allow',
      retryOrFallbackPossible: false,
    },
    'unsupported decision': {
      kind: 'terminal',
      resource: 'https://x',
      action: 'records.read',
      decision: 'block',
      retryOrFallbackPossible: false,
    },
  };
}

export type DemoResult = {
  issued: Array<{ label: string; decision: AccessDecision; verified: boolean; kid: string }>;
  abstained: Array<{ label: string; reason: string }>;
};

/**
 * Run the full flow over the sample events. Fails closed: if any issued record
 * does not pass verification, this throws. A resolved call is success; there is
 * no separate ok flag.
 */
export async function runDemo(log: (m: string) => void = () => {}): Promise<DemoResult> {
  const gateway = await generateKeypair();
  const policy: GatewayVerificationPolicy = {
    expectedIssuer: GATEWAY_ISSUER,
    acceptedPublicKey: gateway.publicKey,
    expectedKid: GATEWAY_KID,
    rejectWarnings: true,
  };
  const result: DemoResult = { issued: [], abstained: [] };

  for (const [label, raw] of Object.entries(sampleEvents())) {
    const observation = parseGatewayBoundaryEvent(raw);
    if ('invalid' in observation) {
      result.abstained.push({ label, reason: observation.invalid });
      log(`ABSTAIN  ${label}  --  ${observation.invalid}`);
      continue;
    }
    const mapped = toAccessDecision(observation);
    if (!mapped.issuable) {
      result.abstained.push({ label, reason: mapped.reason });
      log(`ABSTAIN  ${label}  --  ${mapped.reason}`);
      continue;
    }
    const jws = await issueTerminalAccessDecision({
      issuer: GATEWAY_ISSUER,
      privateKey: gateway.privateKey,
      kid: GATEWAY_KID,
      terminal: mapped.terminal,
    });
    const v = await verifyGatewayDecision(jws, policy);
    if (!v.valid) throw new Error(`issued record failed verification: ${v.reason}`);
    result.issued.push({ label, decision: mapped.terminal.decision, verified: true, kid: v.kid });
    log(`ISSUE    ${label}  --  decision=${mapped.terminal.decision} verified=true kid=${v.kid}`);
  }
  return result;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));

  if (args.has('--show-record')) {
    const gateway = await generateKeypair();
    const jws = await issueTerminalAccessDecision({
      issuer: GATEWAY_ISSUER,
      privateKey: gateway.privateKey,
      kid: GATEWAY_KID,
      terminal: terminal('https://api.internal.example/records/42', 'records.read', 'allow'),
    });
    const v = await verifyGatewayDecision(jws, {
      expectedIssuer: GATEWAY_ISSUER,
      acceptedPublicKey: gateway.publicKey,
      expectedKid: GATEWAY_KID,
      rejectWarnings: true,
    });
    if (!v.valid) throw new Error(`show-record: verification failed: ${v.reason}`);
    console.log('verified:', true);
    // Decode only after verification; the decoded values are for display only.
    console.log('header:', JSON.stringify(decodeJwsHeaderForDisplay(jws), null, 2));
    console.log('claims:', JSON.stringify(decodeJwsClaimsForDemo(jws), null, 2));
    return;
  }

  if (args.has('--tamper')) {
    const gateway = await generateKeypair();
    const attacker = await generateKeypair();
    const policy: GatewayVerificationPolicy = {
      expectedIssuer: GATEWAY_ISSUER,
      acceptedPublicKey: gateway.publicKey,
      expectedKid: GATEWAY_KID,
      rejectWarnings: true,
    };
    const decision = terminal('https://x', 'records.read', 'allow');

    // 1) tampered payload: flip the decision, keep the original signature
    const jws = await issueTerminalAccessDecision({
      issuer: GATEWAY_ISSUER,
      privateKey: gateway.privateKey,
      kid: GATEWAY_KID,
      terminal: decision,
    });
    const [h, , s] = jws.split('.');
    const claims = decodeJwsClaimsForDemo(jws);
    (claims.extensions as Record<string, AccessRecord>)[ACCESS_EXTENSION_KEY].decision = 'deny';
    const tampered = `${h}.${Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')}.${s}`;
    const t = await verifyGatewayDecision(tampered, policy);
    console.log(`tampered payload   -> valid=${t.valid} reason=${t.valid ? 'n/a' : t.reason}`);

    // 2) unaccepted signer: attacker signs a record CLAIMING the expected gateway issuer,
    //    verified with the relying party's configured accepted gateway public key
    const impersonation = await issueTerminalAccessDecision({
      issuer: GATEWAY_ISSUER,
      privateKey: attacker.privateKey,
      kid: GATEWAY_KID,
      terminal: decision,
    });
    const u = await verifyGatewayDecision(impersonation, policy);
    console.log(`unaccepted signer  -> valid=${u.valid} reason=${u.valid ? 'n/a' : u.reason}`);

    // 3) unexpected issuer: attacker signs a cryptographically valid record claiming a
    //    rogue issuer; the relying party expects the gateway issuer
    const rogue = await issueTerminalAccessDecision({
      issuer: 'https://rogue.example',
      privateKey: attacker.privateKey,
      kid: 'rogue',
      terminal: decision,
    });
    const r = await verifyGatewayDecision(rogue, {
      expectedIssuer: GATEWAY_ISSUER,
      acceptedPublicKey: attacker.publicKey,
      rejectWarnings: true,
    });
    console.log(`unexpected issuer  -> valid=${r.valid} reason=${r.valid ? 'n/a' : r.reason}`);
    return;
  }

  const result = await runDemo((m) => console.log(m));
  console.log(
    `\nissued=${result.issued.length} verified=${result.issued.filter((i) => i.verified).length} abstained=${result.abstained.length}`
  );
  if (result.issued.length !== 3 || !result.issued.every((i) => i.verified)) {
    throw new Error('demo did not reach the expected end state');
  }
}

// Run only when invoked directly (repo-preferred guard; not import.meta).
if (process.argv[1] && process.argv[1].endsWith('demo.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
