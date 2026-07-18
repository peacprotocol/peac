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
  parseBoundaryEvent,
  toAccessDecision,
  issueAccessDecision,
  verifyGatewayDecision,
  jwsHeader,
  runDemo,
  type AccessDecision,
  type GatewayVerificationPolicy,
} from './demo.js';

function policyFor(publicKey: Uint8Array): GatewayVerificationPolicy {
  return { expectedIssuer: GATEWAY_ISSUER, acceptedPublicKey: publicKey, expectedKid: GATEWAY_KID };
}

test('issues and strictly verifies a terminal decision for allow, deny, and review', async () => {
  const gateway = await generateKeypair();
  for (const decision of ['allow', 'deny', 'review'] as AccessDecision[]) {
    const obs = parseBoundaryEvent({
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
    const v = await verifyGatewayDecision(jws, policyFor(gateway.publicKey));
    assert.equal(v.valid, true);
    if (!v.valid) return;
    assert.equal(v.decision, decision);
    assert.equal(v.kid, GATEWAY_KID);
    assert.equal(v.wireVersion, '0.2');
  }
});

test('terminality must be explicit: only retryOrFallbackPossible === false is accepted', () => {
  const base = {
    kind: 'terminal',
    resource: 'https://x',
    action: 'records.read',
    decision: 'allow',
  };
  // acceptable
  assert.ok(!('invalid' in parseBoundaryEvent({ ...base, retryOrFallbackPossible: false })));
  // every other value must abstain at the boundary
  for (const bad of [undefined, null, true, 'false', 0, {}]) {
    const raw: Record<string, unknown> = { ...base };
    if (bad !== undefined) raw.retryOrFallbackPossible = bad;
    const parsed = parseBoundaryEvent(raw);
    assert.ok('invalid' in parsed, `retryOrFallbackPossible=${JSON.stringify(bad)} must abstain`);
  }
});

test('non-terminal events carrying a decision are rejected as contradictory', () => {
  for (const raw of [
    { kind: 'check', result: 'failed', decision: 'allow' },
    { kind: 'handling-action', action: 'retry', decision: 'deny' },
    { kind: 'intermediate', decision: 'allow' },
  ]) {
    assert.ok('invalid' in parseBoundaryEvent(raw), `${raw.kind} with a decision must be rejected`);
  }
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
    const parsed = parseBoundaryEvent(raw);
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
  const v = await verifyGatewayDecision(jws, policyFor(gateway.publicKey));
  assert.equal(v.valid, true);
  if (!v.valid) return;
  assert.equal(v.decision, 'allow');
  assert.equal(jwsHeader(jws).kid, GATEWAY_KID);
});

test('profile-strict verification rejects non-conforming but validly signed records', async () => {
  const gateway = await generateKeypair();
  const policy = policyFor(gateway.publicKey);
  const goodAccess = { resource: 'https://x', action: 'records.read', decision: 'allow' as const };

  // 1) wrong record type (application-defined type preserved with a warning by verifyLocal)
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

  // 2) unexpected kid
  const wrongKid = await issueAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: gateway.privateKey,
    kid: 'some-other-kid',
    access: goodAccess,
  });
  const rWrongKid = await verifyGatewayDecision(wrongKid, policy);
  assert.equal(rWrongKid.valid, false);
  if (!rWrongKid.valid) assert.equal(rWrongKid.reason, 'unexpected_kid');

  // 3) additional unregistered extension -> verifier warning -> rejected
  const withUnknownExt = await issue({
    iss: GATEWAY_ISSUER,
    kind: 'evidence',
    type: 'org.peacprotocol/access-decision',
    pillars: ['access'],
    extensions: { [ACCESS_EXTENSION_KEY]: goodAccess, 'com.example/extra': { note: 'x' } },
    privateKey: gateway.privateKey,
    kid: GATEWAY_KID,
  });
  const rWarn = await verifyGatewayDecision(withUnknownExt.jws, policy);
  assert.equal(rWarn.valid, false);
  if (!rWarn.valid) assert.equal(rWarn.reason, 'unexpected_verification_warning');

  // 4) missing access pillar
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
  if (!rNoPillar.valid)
    assert.ok(
      ['missing_access_pillar', 'unexpected_verification_warning'].includes(rNoPillar.reason)
    );
});

test('three distinct trust failures: tamper, unaccepted signer, unexpected issuer', async () => {
  const gateway = await generateKeypair();
  const attacker = await generateKeypair();
  const policy = policyFor(gateway.publicKey);
  const access = { resource: 'https://x', action: 'records.read', decision: 'allow' as const };

  // tamper: flip the decision, keep the signature
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

  // unaccepted signer: attacker signs claiming the expected gateway issuer
  const impersonation = await issueAccessDecision({
    issuer: GATEWAY_ISSUER,
    privateKey: attacker.privateKey,
    kid: GATEWAY_KID,
    access,
  });
  const u = await verifyGatewayDecision(impersonation, policy);
  assert.equal(u.valid, false);
  if (!u.valid) assert.equal(u.reason, 'E_INVALID_SIGNATURE');

  // unexpected issuer: attacker signs a valid record claiming a rogue issuer
  const rogue = await issueAccessDecision({
    issuer: 'https://rogue.example',
    privateKey: attacker.privateKey,
    kid: 'rogue',
    access,
  });
  const r = await verifyGatewayDecision(rogue, {
    expectedIssuer: GATEWAY_ISSUER,
    acceptedPublicKey: attacker.publicKey,
  });
  assert.equal(r.valid, false);
  if (!r.valid) assert.equal(r.reason, 'E_INVALID_ISSUER');
});

test('runDemo fails closed and reaches the expected end state', async () => {
  const r = await runDemo();
  assert.equal(r.ok, true);
  assert.equal(r.issued.length, 3);
  assert.ok(r.issued.every((i) => i.verified));
  assert.ok(r.issued.every((i) => i.kid === GATEWAY_KID));
  assert.deepEqual(r.issued.map((i) => i.decision).sort(), ['allow', 'deny', 'review']);
  assert.equal(r.abstained.length, 7);
});
