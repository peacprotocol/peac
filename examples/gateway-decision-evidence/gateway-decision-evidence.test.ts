/**
 * Comprehensive assertion battery for the Gateway Decision Evidence example.
 *
 * Runs with the Node built-in test runner (no vitest config dependency):
 *   node --import tsx --test gateway-decision-evidence.test.ts
 * A thin CI smoke test lives at tests/tooling/gateway-decision-evidence-example.test.ts
 * so the repository gate covers this example too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issue } from '@peac/protocol';
import { generateKeypair } from '@peac/crypto';
import { ACCESS_EXTENSION_KEY } from '@peac/schema';
import {
  GATEWAY_ISSUER,
  GATEWAY_KID,
  parseGatewayBoundaryEvent,
  toAccessDecision,
  issueTerminalAccessDecision,
  verifyGatewayDecision,
  runDemo,
  type AccessDecision,
  type GatewayVerificationPolicy,
  type TerminalGatewayAccessDecision,
} from './demo.js';

// Compile-time invariant (validated by `tsc --noEmit`, never executed): a plain
// {resource, action, decision} object is NOT a TerminalGatewayAccessDecision, so
// terminality cannot be bypassed by constructing a bare access object.
type _PlainAccessIsNotTerminal = {
  resource: string;
  action: string;
  decision: AccessDecision;
} extends TerminalGatewayAccessDecision
  ? false
  : true;
const _terminalInvariant: _PlainAccessIsNotTerminal = true;
void _terminalInvariant;

const TERMINAL_REQUIRED =
  /a terminal gateway access decision with retryOrFallbackPossible=false is required/;

function strictPolicy(publicKey: Uint8Array): GatewayVerificationPolicy {
  return {
    expectedIssuer: GATEWAY_ISSUER,
    acceptedPublicKey: publicKey,
    expectedKid: GATEWAY_KID,
    rejectWarnings: true,
  };
}
function terminal(
  resource: string,
  action: string,
  decision: AccessDecision
): TerminalGatewayAccessDecision {
  return { kind: 'terminal', resource, action, decision, retryOrFallbackPossible: false };
}

test('issues and verifies a terminal decision for allow, deny, and review', async () => {
  const gateway = await generateKeypair();
  for (const decision of ['allow', 'deny', 'review'] as AccessDecision[]) {
    const observation = parseGatewayBoundaryEvent({
      kind: 'terminal',
      resource: 'https://api.internal.example/records/42',
      action: 'records.read',
      decision,
      retryOrFallbackPossible: false,
    });
    assert.ok(!('invalid' in observation), `expected valid parse for ${decision}`);
    const mapped = toAccessDecision(observation);
    assert.equal(mapped.issuable, true);
    if (!mapped.issuable) return;
    const jws = await issueTerminalAccessDecision({
      issuer: GATEWAY_ISSUER,
      privateKey: gateway.privateKey,
      kid: GATEWAY_KID,
      terminal: mapped.terminal,
    });
    const v = await verifyGatewayDecision(jws, strictPolicy(gateway.publicKey));
    assert.equal(v.valid, true);
    if (!v.valid) return;
    assert.equal(v.decision, decision);
    assert.equal(v.kid, GATEWAY_KID);
    assert.equal(v.wireVersion, '0.2');
    assert.deepEqual(v.warnings, []);
  }
});

test('issuance boundary: terminality is retained from parse through issuance', async () => {
  const observation = parseGatewayBoundaryEvent({
    kind: 'terminal',
    resource: 'https://x',
    action: 'records.read',
    decision: 'allow',
    retryOrFallbackPossible: false,
  });
  assert.ok(!('invalid' in observation));
  if ('invalid' in observation) return;
  const mapped = toAccessDecision(observation);
  assert.equal(mapped.issuable, true);
  if (!mapped.issuable) return;
  assert.equal(mapped.terminal.kind, 'terminal');
  assert.equal(mapped.terminal.retryOrFallbackPossible, false);

  const gateway = await generateKeypair();
  const jws = await issueTerminalAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
    terminal: mapped.terminal,
  });
  const v = await verifyGatewayDecision(jws, strictPolicy(gateway.publicKey));
  assert.equal(v.valid, true);
});

test('runtime guard: issuance rejects non-terminal or cast inputs', async () => {
  const gateway = await generateKeypair();
  const cast = (value: unknown) =>
    issueTerminalAccessDecision({
      issuer: GATEWAY_ISSUER,
      privateKey: gateway.privateKey,
      kid: GATEWAY_KID,
      terminal: value as unknown as TerminalGatewayAccessDecision,
    });

  await assert.rejects(
    cast({ resource: 'https://x', action: 'records.read', decision: 'allow' }),
    TERMINAL_REQUIRED
  );
  await assert.rejects(cast({ kind: 'intermediate' }), TERMINAL_REQUIRED);
  await assert.rejects(
    cast({
      kind: 'terminal',
      resource: 'https://x',
      action: 'records.read',
      decision: 'allow',
      retryOrFallbackPossible: true,
    }),
    TERMINAL_REQUIRED
  );
  await assert.rejects(
    cast({ kind: 'terminal', resource: 'https://x', action: 'records.read', decision: 'allow' }),
    TERMINAL_REQUIRED
  );
});

test('non-terminal and malformed states never produce an issuable result', () => {
  const nonIssuable: unknown[] = [
    { kind: 'check', result: 'failed' },
    { kind: 'intermediate' },
    { kind: 'handling-action', action: 'retry' },
    { kind: 'third-party-report', source: 'https://collector.example' },
    { kind: 'terminal', resource: 'https://x', action: 'records.read', decision: 'deny' },
    {
      kind: 'terminal',
      resource: 'https://x',
      action: 'records.read',
      decision: 'block',
      retryOrFallbackPossible: false,
    },
    { kind: 'terminal', resource: 'https://x', decision: 'allow', retryOrFallbackPossible: false },
  ];
  for (const raw of nonIssuable) {
    const parsed = parseGatewayBoundaryEvent(raw);
    if ('invalid' in parsed) continue;
    assert.equal(
      toAccessDecision(parsed).issuable,
      false,
      `${JSON.stringify(raw)} must not be issuable`
    );
  }
});

test('terminality must be explicit: only retryOrFallbackPossible === false is accepted', () => {
  const base = {
    kind: 'terminal',
    resource: 'https://x',
    action: 'records.read',
    decision: 'allow',
  };
  assert.ok(!('invalid' in parseGatewayBoundaryEvent({ ...base, retryOrFallbackPossible: false })));
  for (const bad of [undefined, null, true, 'false', 0, {}]) {
    const raw: Record<string, unknown> = { ...base };
    if (bad !== undefined) raw.retryOrFallbackPossible = bad;
    assert.ok(
      'invalid' in parseGatewayBoundaryEvent(raw),
      `retryOrFallbackPossible=${JSON.stringify(bad)} must abstain`
    );
  }
});

test('non-terminal events carrying a decision are rejected as contradictory', () => {
  for (const raw of [
    { kind: 'check', result: 'failed', decision: 'allow' },
    { kind: 'handling-action', action: 'retry', decision: 'deny' },
    { kind: 'intermediate', decision: 'allow' },
  ]) {
    assert.ok(
      'invalid' in parseGatewayBoundaryEvent(raw),
      `${raw.kind} with a decision must be rejected`
    );
  }
});

test('whitespace-only strings abstain (resource, action, third-party source)', () => {
  assert.ok(
    'invalid' in
      parseGatewayBoundaryEvent({
        kind: 'terminal',
        resource: '   ',
        action: 'records.read',
        decision: 'allow',
        retryOrFallbackPossible: false,
      })
  );
  assert.ok(
    'invalid' in
      parseGatewayBoundaryEvent({
        kind: 'terminal',
        resource: 'https://x',
        action: '  ',
        decision: 'allow',
        retryOrFallbackPossible: false,
      })
  );
  assert.ok('invalid' in parseGatewayBoundaryEvent({ kind: 'third-party-report', source: '  ' }));
});

test('verified claim shape: decision and kid from the validated verifier output', async () => {
  const gateway = await generateKeypair();
  const jws = await issueTerminalAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
    terminal: terminal('https://x', 'records.read', 'allow'),
  });
  const v = await verifyGatewayDecision(jws, strictPolicy(gateway.publicKey));
  assert.equal(v.valid, true);
  if (!v.valid) return;
  assert.equal(v.decision, 'allow');
  assert.equal(v.kid, GATEWAY_KID);
});

test('malformed JWS returns a typed failure and does not throw', async () => {
  const gateway = await generateKeypair();
  const v = await verifyGatewayDecision('not-a-jws', strictPolicy(gateway.publicKey));
  assert.equal(v.valid, false);
  if (!v.valid) assert.equal(typeof v.reason, 'string');
});

test('mandatory checks reject non-conforming but validly signed records', async () => {
  const gateway = await generateKeypair();
  const policy = strictPolicy(gateway.publicKey);
  const goodAccess = { resource: 'https://x', action: 'records.read', decision: 'allow' as const };

  // Adversarial: raw issue() intentionally builds non-conforming records that the
  // example issuance helper could never produce.
  const wrongType = await issue({
    iss: GATEWAY_ISSUER,
    kind: 'evidence',
    type: 'com.example/custom-evidence',
    pillars: ['access'],
    extensions: { [ACCESS_EXTENSION_KEY]: goodAccess },
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
  });
  const rWrongType = await verifyGatewayDecision(wrongType.jws, policy);
  assert.equal(rWrongType.valid, false);
  if (!rWrongType.valid) assert.equal(rWrongType.reason, 'unexpected_record_type');

  const wrongKid = await issueTerminalAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: 'some-other-kid',
    terminal: terminal('https://x', 'records.read', 'allow'),
  });
  const rWrongKid = await verifyGatewayDecision(wrongKid, policy);
  assert.equal(rWrongKid.valid, false);
  if (!rWrongKid.valid) assert.equal(rWrongKid.reason, 'unexpected_kid');

  const noPillar = await issue({
    iss: GATEWAY_ISSUER,
    kind: 'evidence',
    type: 'org.peacprotocol/access-decision',
    pillars: ['provenance'],
    extensions: { [ACCESS_EXTENSION_KEY]: goodAccess },
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
  });
  const rNoPillar = await verifyGatewayDecision(noPillar.jws, policy);
  assert.equal(rNoPillar.valid, false);
  if (!rNoPillar.valid) assert.equal(rNoPillar.reason, 'missing_access_pillar');
});

test('optional kid policy: enforced only when configured', async () => {
  const gateway = await generateKeypair();
  const jws = await issueTerminalAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: 'alternate-key',
    terminal: terminal('https://x', 'records.read', 'allow'),
  });

  const noKidPolicy = await verifyGatewayDecision(jws, {
    expectedIssuer: GATEWAY_ISSUER,
    acceptedPublicKey: gateway.publicKey,
  });
  assert.equal(noKidPolicy.valid, true);
  if (noKidPolicy.valid) assert.equal(noKidPolicy.kid, 'alternate-key');

  const pinned = await verifyGatewayDecision(jws, strictPolicy(gateway.publicKey));
  assert.equal(pinned.valid, false);
  if (!pinned.valid) assert.equal(pinned.reason, 'unexpected_kid');
});

test('warning policy: application extensions accepted by default, rejected only under rejectWarnings', async () => {
  const gateway = await generateKeypair();
  const goodAccess = { resource: 'https://x', action: 'records.read', decision: 'allow' as const };
  const withUnknownExt = await issue({
    iss: GATEWAY_ISSUER,
    kind: 'evidence',
    type: 'org.peacprotocol/access-decision',
    pillars: ['access'],
    extensions: { [ACCESS_EXTENSION_KEY]: goodAccess, 'com.example/extra': { note: 'x' } },
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
  });

  const permissive = await verifyGatewayDecision(withUnknownExt.jws, {
    expectedIssuer: GATEWAY_ISSUER,
    acceptedPublicKey: gateway.publicKey,
    expectedKid: GATEWAY_KID,
  });
  assert.equal(permissive.valid, true);
  if (permissive.valid) {
    assert.ok(permissive.warnings.length >= 1, 'expected a preserved-extension warning');
    for (const w of permissive.warnings) assert.equal(typeof w.code, 'string');
  }

  const conservative = await verifyGatewayDecision(
    withUnknownExt.jws,
    strictPolicy(gateway.publicKey)
  );
  assert.equal(conservative.valid, false);
  if (!conservative.valid) assert.equal(conservative.reason, 'unexpected_verification_warning');
});

test('three distinct trust failures: tamper, unaccepted signer, unexpected issuer', async () => {
  const gateway = await generateKeypair();
  const attacker = await generateKeypair();
  const policy = strictPolicy(gateway.publicKey);
  const decision = terminal('https://x', 'records.read', 'allow');

  const jws = await issueTerminalAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
    terminal: decision,
  });
  const [h, , s] = jws.split('.');
  const claims = JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'));
  claims.extensions[ACCESS_EXTENSION_KEY].decision = 'deny';
  const tampered = `${h}.${Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')}.${s}`;
  const t = await verifyGatewayDecision(tampered, policy);
  assert.equal(t.valid, false);
  if (!t.valid) assert.equal(t.reason, 'E_INVALID_SIGNATURE');

  const impersonation = await issueTerminalAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: attacker.privateKey,
    kid: GATEWAY_KID,
    terminal: decision,
  });
  const u = await verifyGatewayDecision(impersonation, policy);
  assert.equal(u.valid, false);
  if (!u.valid) assert.equal(u.reason, 'E_INVALID_SIGNATURE');

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
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.reason, 'E_INVALID_ISSUER');
});

test('runDemo fails closed and reaches the expected end state', async () => {
  const r = await runDemo();
  assert.equal(r.issued.length, 3);
  assert.ok(r.issued.every((i) => i.verified));
  assert.ok(r.issued.every((i) => i.kid === GATEWAY_KID));
  assert.deepEqual(r.issued.map((i) => i.decision).sort(), ['allow', 'deny', 'review']);
  assert.equal(r.abstained.length, 7);
});
