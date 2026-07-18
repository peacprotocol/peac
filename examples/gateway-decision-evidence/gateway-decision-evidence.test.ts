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
  parseIssuerControlledBoundaryEvent,
  toAccessDecision,
  issueAccessDecision,
  verifyGatewayDecision,
  jwsHeader,
  runDemo,
  type AccessDecision,
  type GatewayVerificationPolicy,
} from './demo.js';

function strictPolicy(publicKey: Uint8Array): GatewayVerificationPolicy {
  return {
    expectedIssuer: GATEWAY_ISSUER,
    acceptedPublicKey: publicKey,
    expectedKid: GATEWAY_KID,
    rejectWarnings: true,
  };
}

test('issues and verifies a terminal decision for allow, deny, and review', async () => {
  const gateway = await generateKeypair();
  for (const decision of ['allow', 'deny', 'review'] as AccessDecision[]) {
    const obs = parseIssuerControlledBoundaryEvent({
      kind: 'terminal',
      resource: 'https://api.internal.example/records/42',
      action: 'records.read',
      decision,
      retryOrFallbackPossible: false,
    });
    assert.ok(!('invalid' in obs), `expected valid parse for ${decision}`);
    const mapped = toAccessDecision(obs);
    assert.equal(mapped.issuable, true);
    if (!mapped.issuable) return;
    const jws = await issueAccessDecision({
      issuer: GATEWAY_ISSUER,
      privateKey: gateway.privateKey,
      kid: GATEWAY_KID,
      access: mapped.access,
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

test('terminality must be explicit: only retryOrFallbackPossible === false is accepted', () => {
  const base = {
    kind: 'terminal',
    resource: 'https://x',
    action: 'records.read',
    decision: 'allow',
  };
  assert.ok(
    !('invalid' in parseIssuerControlledBoundaryEvent({ ...base, retryOrFallbackPossible: false }))
  );
  for (const bad of [undefined, null, true, 'false', 0, {}]) {
    const raw: Record<string, unknown> = { ...base };
    if (bad !== undefined) raw.retryOrFallbackPossible = bad;
    const parsed = parseIssuerControlledBoundaryEvent(raw);
    assert.ok('invalid' in parsed, `retryOrFallbackPossible=${JSON.stringify(bad)} must abstain`);
  }
});

test('non-terminal events carrying a decision are rejected as contradictory', () => {
  for (const raw of [
    { kind: 'check', result: 'failed', decision: 'allow' },
    { kind: 'handling-action', action: 'retry', decision: 'deny' },
    { kind: 'intermediate', decision: 'allow' },
  ]) {
    assert.ok(
      'invalid' in parseIssuerControlledBoundaryEvent(raw),
      `${raw.kind} with a decision must be rejected`
    );
  }
});

test('whitespace-only strings abstain (resource, action, third-party source)', () => {
  assert.ok(
    'invalid' in
      parseIssuerControlledBoundaryEvent({
        kind: 'terminal',
        resource: '   ',
        action: 'records.read',
        decision: 'allow',
        retryOrFallbackPossible: false,
      })
  );
  assert.ok(
    'invalid' in
      parseIssuerControlledBoundaryEvent({
        kind: 'terminal',
        resource: 'https://x',
        action: '  ',
        decision: 'allow',
        retryOrFallbackPossible: false,
      })
  );
  assert.ok(
    'invalid' in parseIssuerControlledBoundaryEvent({ kind: 'third-party-report', source: '  ' })
  );
});

test('abstains (no record) for every non-terminal or unsupported state', () => {
  const cases: Array<[string, unknown]> = [
    ['check-only', { kind: 'check', result: 'failed' }],
    ['intermediate', { kind: 'intermediate' }],
    [
      'terminal-without-established-terminality',
      { kind: 'terminal', resource: 'https://x', action: 'records.read', decision: 'deny' },
    ],
    ['handling-action:log', { kind: 'handling-action', action: 'log' }],
    ['handling-action:retry', { kind: 'handling-action', action: 'retry' }],
    ['handling-action:fallback', { kind: 'handling-action', action: 'fallback' }],
    ['handling-action:continue', { kind: 'handling-action', action: 'continue' }],
    ['handling-action:transform', { kind: 'handling-action', action: 'transform' }],
    ['third-party-report', { kind: 'third-party-report', source: 'https://collector.example' }],
    [
      'missing-resource',
      {
        kind: 'terminal',
        action: 'records.read',
        decision: 'allow',
        retryOrFallbackPossible: false,
      },
    ],
    [
      'missing-action',
      {
        kind: 'terminal',
        resource: 'https://x',
        decision: 'allow',
        retryOrFallbackPossible: false,
      },
    ],
    [
      'missing-decision',
      {
        kind: 'terminal',
        resource: 'https://x',
        action: 'records.read',
        retryOrFallbackPossible: false,
      },
    ],
    [
      'unsupported-decision',
      {
        kind: 'terminal',
        resource: 'https://x',
        action: 'records.read',
        decision: 'block',
        retryOrFallbackPossible: false,
      },
    ],
    ['unknown-kind', { kind: 'transformation' }],
    ['not-an-object', 42],
  ];
  for (const [label, raw] of cases) {
    const parsed = parseIssuerControlledBoundaryEvent(raw);
    if ('invalid' in parsed) continue; // abstained at the boundary
    assert.equal(toAccessDecision(parsed).issuable, false, `${label} must abstain`);
  }
});

test('verified claim shape: type, pillars, kid, access extension', async () => {
  const gateway = await generateKeypair();
  const jws = await issueAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
    access: { resource: 'https://x', action: 'records.read', decision: 'allow' },
  });
  const v = await verifyGatewayDecision(jws, strictPolicy(gateway.publicKey));
  assert.equal(v.valid, true);
  if (!v.valid) return;
  assert.equal(v.decision, 'allow');
  assert.equal(jwsHeader(jws).kid, GATEWAY_KID);
});

test('mandatory structural checks reject non-conforming but validly signed records', async () => {
  const gateway = await generateKeypair();
  const policy = strictPolicy(gateway.publicKey);
  const goodAccess = { resource: 'https://x', action: 'records.read', decision: 'allow' as const };

  // wrong record type (application-defined type preserved with a warning by verifyLocal)
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

  // unexpected kid
  const wrongKid = await issueAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: 'some-other-kid',
    access: goodAccess,
  });
  const rWrongKid = await verifyGatewayDecision(wrongKid, policy);
  assert.equal(rWrongKid.valid, false);
  if (!rWrongKid.valid) assert.equal(rWrongKid.reason, 'unexpected_kid');

  // missing access pillar (pillar check runs before the warning policy) -> exact reason
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

  // default (warning-preserving) policy: accepted, warnings surfaced
  const permissive = await verifyGatewayDecision(withUnknownExt.jws, {
    expectedIssuer: GATEWAY_ISSUER,
    acceptedPublicKey: gateway.publicKey,
    expectedKid: GATEWAY_KID,
  });
  assert.equal(permissive.valid, true);
  if (permissive.valid)
    assert.ok(permissive.warnings.length >= 1, 'expected a preserved-extension warning');

  // conservative policy: same record rejected
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
  const access = { resource: 'https://x', action: 'records.read', decision: 'allow' as const };

  const jws = await issueAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
    access,
  });
  const [h, , s] = jws.split('.');
  const claims = JSON.parse(Buffer.from(jws.split('.')[1], 'base64url').toString('utf8'));
  claims.extensions[ACCESS_EXTENSION_KEY].decision = 'deny';
  const tampered = `${h}.${Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url')}.${s}`;
  const t = await verifyGatewayDecision(tampered, policy);
  assert.equal(t.valid, false);
  if (!t.valid) assert.equal(t.reason, 'E_INVALID_SIGNATURE');

  const impersonation = await issueAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: attacker.privateKey,
    kid: GATEWAY_KID,
    access,
  });
  const u = await verifyGatewayDecision(impersonation, policy);
  assert.equal(u.valid, false);
  if (!u.valid) assert.equal(u.reason, 'E_INVALID_SIGNATURE');

  const rogue = await issueAccessDecision({
    issuer: 'https://rogue.example',
    privateKey: attacker.privateKey,
    kid: 'rogue',
    access,
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
