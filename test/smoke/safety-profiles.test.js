/**
 * Safety profiles smoke test - validates PEIP-SAF schema validation and receipt generation
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateSafetyPolicy,
  issueSafetyReceipt,
  createReceiptSigner,
  validateSafetyEvent,
} from '../../packages/profiles-safety/dist/index.js';
import { generateEdDSAKeyPair, uuidv7 } from '../../packages/core/dist/index.js';

test('PEIP-SAF core policy validation', async () => {
  const corePolicy = {
    profile: 'peip-saf/core',
    version: 'v1',
    disclosure_cadence: {
      enabled: true,
      interval: 'PT1H',
    },
    crisis_referral: {
      enabled: true,
      keywords: ['suicide', 'self-harm', 'crisis'],
    },
    minors_gate: {
      enabled: true,
      min_age: 13,
    },
    intent_keys: [
      {
        key: 'violence',
        description: 'Content depicting violence',
        severity: 'high',
        keywords: ['violence', 'harm', 'injury'],
      },
    ],
  };

  const result = await validateSafetyPolicy(corePolicy);

  assert.strictEqual(result.valid, true, 'Core policy should be valid');
  assert.strictEqual(result.profile, 'peip-saf/core', 'Should identify core profile');
});

test('PEIP-SAF US-CA-SB243 overlay validation', async () => {
  const sb243Policy = {
    profile: 'peip-saf/us-ca-sb243',
    version: 'v1',
    disclosure_cadence: {
      enabled: true,
      interval: 'PT3H', // Required 3-hour default
    },
    crisis_referral: {
      enabled: true,
      keywords: ['suicide', 'crisis'],
    },
    minors_gate: {
      enabled: true,
      min_age: 13,
    },
    intent_keys: [
      {
        key: 'harassment',
        description: 'Harassment content',
        severity: 'medium',
      },
    ],
    jurisdiction: 'US-CA',
    sb243_compliance: {
      enabled: true,
      designated_contact: {
        name: 'Safety Officer',
        email: 'safety@example.com',
      },
      reporting_mechanism: {
        available: true,
        anonymous_option: true,
      },
    },
    osp_report_url: 'https://example.com/safety-report',
  };

  const result = await validateSafetyPolicy(sb243Policy);

  assert.strictEqual(result.valid, true, 'SB-243 policy should be valid');
  assert.strictEqual(result.profile, 'peip-saf/us-ca-sb243', 'Should identify SB-243 profile');
});

test('Safety event validation', async () => {
  const safetyEvent = {
    event_type: 'intent_classification',
    timestamp: Math.floor(Date.now() / 1000),
    counters: {
      total_events: 1,
      severity_counts: {
        medium: 1,
      },
      time_window: 'PT1H',
    },
    intent_key: 'harassment',
    action_taken: 'warning_displayed',
  };

  const result = await validateSafetyEvent(safetyEvent);

  assert.strictEqual(result.valid, true, 'Safety event should be valid');
});

test('Safety receipt generation', async () => {
  const keyPair = await generateEdDSAKeyPair();
  const signer = createReceiptSigner(keyPair.privateKey, keyPair.kid);

  const safetyEvent = {
    event_type: 'policy_violation',
    timestamp: Math.floor(Date.now() / 1000),
    counters: {
      total_events: 5,
      severity_counts: {
        high: 2,
        medium: 3,
      },
    },
    action_taken: 'content_filtered',
  };

  const options = {
    signer,
    purpose: 'content_moderation',
  };

  const result = await issueSafetyReceipt(safetyEvent, options);

  // Validate receipt structure
  assert.strictEqual(result.receipt['@type'], 'PEACReceipt/SafetyEvent', 'Correct receipt type');
  assert(result.receipt.rid, 'Receipt ID should be present');
  assert(result.receipt.policy_hash, 'Policy hash should be present');
  assert.strictEqual(result.receipt.purpose, 'content_moderation', 'Purpose should match');

  // Validate expiry constraint (≤ 5 minutes)
  const maxExp = result.receipt.iat + 300;
  assert(result.receipt.exp <= maxExp, 'Receipt expiry must not exceed 5 minutes');

  // Validate JWS structure
  assert(typeof result.jws.protected === 'string', 'JWS protected header must be present');
  assert(typeof result.jws.signature === 'string', 'JWS signature must be present');

  // Validate protected header
  const protectedHeader = JSON.parse(Buffer.from(result.jws.protected, 'base64url').toString());
  assert.strictEqual(protectedHeader.alg, 'EdDSA', 'Algorithm must be EdDSA');
  assert.strictEqual(protectedHeader.b64, false, 'Must use detached format');
  assert.deepStrictEqual(protectedHeader.crit, ['b64'], 'Critical extensions must be correct');
});

test('Receipt PII validation', async () => {
  const keyPair = await generateEdDSAKeyPair();
  const signer = createReceiptSigner(keyPair.privateKey, keyPair.kid);

  // Event with potential PII (should be rejected)
  const eventWithPII = {
    event_type: 'disclosure',
    timestamp: Math.floor(Date.now() / 1000),
    counters: {
      total_events: 1,
      user_email: 'user@example.com', // This is PII
    },
    action_taken: 'escalated',
  };

  try {
    await issueSafetyReceipt(eventWithPII, { signer });
    assert.fail('Should reject event containing PII');
  } catch (error) {
    assert(error.message.includes('Invalid safety event'), 'Should reject PII in safety event');
  }
});
