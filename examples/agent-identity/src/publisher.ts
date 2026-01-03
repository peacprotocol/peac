/**
 * Agent Identity Example - Publisher Side
 *
 * This example demonstrates how a publisher verifies agent identity
 * attestations and makes access decisions based on control type.
 */

import {
  validateAgentIdentityAttestation,
  isAgentIdentityAttestation,
  isAttestationExpired,
  isAttestationNotYetValid,
  type AgentIdentityAttestation,
} from '@peac/schema';

/**
 * Verification result for agent identity.
 */
export interface VerificationResult {
  valid: boolean;
  agentId?: string;
  controlType?: 'operator' | 'user-delegated';
  error?: string;
  errorCode?: string;
}

/**
 * Verify an agent identity attestation.
 *
 * This function performs structural validation and time-based checks.
 * In production, you would also verify cryptographic signatures.
 */
export function verifyAgentIdentity(
  attestation: unknown
): VerificationResult {
  // Check if it's the right type
  if (
    !attestation ||
    typeof attestation !== 'object' ||
    !('type' in attestation)
  ) {
    return {
      valid: false,
      error: 'No attestation provided',
      errorCode: 'E_IDENTITY_MISSING',
    };
  }

  // Check attestation type
  if (!isAgentIdentityAttestation(attestation as { type: string })) {
    return {
      valid: false,
      error: 'Invalid attestation type',
      errorCode: 'E_IDENTITY_INVALID_FORMAT',
    };
  }

  // Validate schema
  const result = validateAgentIdentityAttestation(attestation);
  if (!result.ok) {
    return {
      valid: false,
      error: result.error,
      errorCode: 'E_IDENTITY_INVALID_FORMAT',
    };
  }

  const validAttestation = result.value;

  // Check time bounds
  if (isAttestationExpired(validAttestation)) {
    return {
      valid: false,
      error: 'Attestation has expired',
      errorCode: 'E_IDENTITY_EXPIRED',
    };
  }

  if (isAttestationNotYetValid(validAttestation)) {
    return {
      valid: false,
      error: 'Attestation is not yet valid',
      errorCode: 'E_IDENTITY_NOT_YET_VALID',
    };
  }

  // In production: Verify cryptographic proof here
  // - Fetch JWKS from key_directory_url
  // - Verify signature using the public key
  // - Check binding matches the request

  return {
    valid: true,
    agentId: validAttestation.evidence.agent_id,
    controlType: validAttestation.evidence.control_type,
  };
}

/**
 * Access policy based on agent identity.
 */
export interface AccessPolicy {
  controlType: 'operator' | 'user-delegated' | '*';
  capabilities?: string[];
  decision: 'allow' | 'deny' | 'review';
  rateLimit?: { windowSeconds: number; maxRequests: number };
}

/**
 * Evaluate access based on verified identity.
 */
export function evaluateAccess(
  verification: VerificationResult,
  policies: AccessPolicy[]
): { decision: 'allow' | 'deny' | 'review'; matchedPolicy?: AccessPolicy } {
  if (!verification.valid) {
    return { decision: 'deny' };
  }

  for (const policy of policies) {
    if (
      policy.controlType === '*' ||
      policy.controlType === verification.controlType
    ) {
      return { decision: policy.decision, matchedPolicy: policy };
    }
  }

  return { decision: 'deny' };
}

// Example usage when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Example attestation
  const attestation: AgentIdentityAttestation = {
    type: 'peac/agent-identity',
    issuer: 'https://crawler.example.com',
    issued_at: new Date().toISOString(),
    evidence: {
      agent_id: 'bot:crawler-prod-001',
      control_type: 'operator',
      operator: 'Example Crawler Inc.',
      capabilities: ['crawl', 'index'],
    },
  };

  console.log('=== Verifying Agent Identity ===\n');
  const verification = verifyAgentIdentity(attestation);
  console.log('Verification result:', JSON.stringify(verification, null, 2));

  // Example policies
  const policies: AccessPolicy[] = [
    {
      controlType: 'operator',
      decision: 'allow',
      rateLimit: { windowSeconds: 60, maxRequests: 100 },
    },
    {
      controlType: 'user-delegated',
      decision: 'allow',
      rateLimit: { windowSeconds: 60, maxRequests: 30 },
    },
    {
      controlType: '*',
      decision: 'deny',
    },
  ];

  console.log('\n=== Evaluating Access ===\n');
  const access = evaluateAccess(verification, policies);
  console.log('Access decision:', JSON.stringify(access, null, 2));
}
