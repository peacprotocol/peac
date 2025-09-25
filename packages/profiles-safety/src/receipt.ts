/**
 * Safety event receipt generation using detached JWS
 */

import { signDetached, uuidv7, canonicalPolicyHash } from '@peac/core';
import type { KeyLike } from '@peac/core';
import type { SafetyEvent, SafetyEventReceipt } from './types';
import { validateSafetyEvent } from './validate-event';

export interface ReceiptSigner {
  privateKey: KeyLike;
  kid: string;
}

export interface IssueReceiptOptions {
  signer: ReceiptSigner;
  traceId?: string;
  purpose?: string;
  prefsUrl?: string;
  prefsHash?: string;
  payment?: SafetyEventReceipt['payment'];
  compliance?: SafetyEventReceipt['compliance'];
}

export interface IssuedReceipt {
  receipt: SafetyEventReceipt;
  jws: {
    protected: string;
    signature: string;
  };
}

/**
 * Issue safety event receipt with detached JWS signature
 */
export async function issueSafetyReceipt(
  event: SafetyEvent,
  options: IssueReceiptOptions
): Promise<IssuedReceipt> {
  // Validate event against safety-event schema
  const validation = await validateSafetyEvent(event);
  if (!validation.valid) {
    throw new Error(`Invalid safety event: ${validation.errors?.join(', ')}`);
  }

  // Generate receipt
  const now = Math.floor(Date.now() / 1000);
  const rid = uuidv7();

  // Calculate policy hash from event (simplified - in real impl would use actual policy)
  const policyInputs = {
    event_type: event.event_type,
    timestamp: event.timestamp,
    counters: event.counters,
  };
  const policyHash = canonicalPolicyHash(policyInputs);

  const receipt: SafetyEventReceipt = {
    '@type': 'PEACReceipt/SafetyEvent',
    iss: 'https://safety.peacprotocol.org',
    sub: 'https://example.com/resource',
    aud: 'https://example.com/resource',
    iat: now,
    exp: now + 300, // 5 minutes max per spec
    rid,
    policy_hash: policyHash,
    safety_event: event,
  };

  // Add optional fields
  if (options.traceId) {
    receipt.trace_id = options.traceId;
  }
  if (options.purpose) {
    receipt.purpose = options.purpose;
  }
  if (options.prefsUrl) {
    receipt.prefs_url = options.prefsUrl;
  }
  if (options.prefsHash) {
    receipt.prefs_hash = options.prefsHash;
  }
  if (options.payment) {
    receipt.payment = options.payment;
  }
  if (options.compliance) {
    receipt.compliance = options.compliance;
  }

  // Create detached JWS signature
  const payload = JSON.stringify(receipt);
  const jws = await signDetached(payload, options.signer.privateKey, options.signer.kid);

  return {
    receipt,
    jws,
  };
}

/**
 * Create receipt signer from key pair
 */
export function createReceiptSigner(privateKey: KeyLike, kid: string): ReceiptSigner {
  return {
    privateKey,
    kid,
  };
}

/**
 * Validate receipt structure and constraints
 */
export function validateReceiptStructure(receipt: SafetyEventReceipt): {
  valid: boolean;
  errors?: string[];
} {
  const errors: string[] = [];

  // Check required fields
  if (!receipt['@type'] || receipt['@type'] !== 'PEACReceipt/SafetyEvent') {
    errors.push('Invalid or missing @type');
  }

  // Check UUIDv7 rid format
  const uuidv7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidv7Pattern.test(receipt.rid)) {
    errors.push('Receipt ID (rid) must be UUIDv7 format');
  }

  // Check expiry constraint (≤ 5 minutes)
  const maxExp = receipt.iat + 300;
  if (receipt.exp > maxExp) {
    errors.push('Receipt expiry cannot exceed 5 minutes from issued time');
  }

  // Check non-PII constraint in safety_event
  const event = receipt.safety_event;
  if (containsPII(event)) {
    errors.push('Safety event contains PII - only non-PII counters allowed');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Check for potential PII in safety event (basic check)
 */
function containsPII(event: SafetyEvent): boolean {
  // Basic PII detection - look for patterns that might be personal info
  const eventStr = JSON.stringify(event).toLowerCase();

  // Check for email patterns
  if (/@[a-z0-9-]+\.[a-z]{2,}/.test(eventStr)) {
    return true;
  }

  // Check for phone patterns
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(eventStr)) {
    return true;
  }

  // Check for common PII field names
  const piiFields = ['email', 'phone', 'name', 'address', 'ssn', 'user_id', 'username'];
  for (const field of piiFields) {
    if (eventStr.includes(field)) {
      return true;
    }
  }

  return false;
}
