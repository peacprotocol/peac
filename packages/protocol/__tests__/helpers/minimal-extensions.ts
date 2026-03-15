/**
 * Shared minimal valid extension fixtures for first-party receipt types.
 *
 * Used across protocol, MCP, and integration tests to satisfy
 * type-to-extension enforcement without duplicating inline blobs.
 */

/** Minimal valid extension values for each registered extension group */
export const MINIMAL_FIRST_PARTY_EXTENSIONS: Record<string, Record<string, unknown>> = {
  'org.peacprotocol/commerce': {
    payment_rail: 'stripe',
    amount_minor: '1000',
    currency: 'USD',
  },
  'org.peacprotocol/access': {
    resource: 'https://example.com/api',
    action: 'read',
    decision: 'allow',
  },
  'org.peacprotocol/challenge': { challenge_type: 'payment_required' },
  'org.peacprotocol/identity': { proof_ref: 'proof-001' },
  'org.peacprotocol/correlation': { trace_id: 'a'.repeat(32) },
  'org.peacprotocol/consent': { consent_basis: 'explicit', consent_status: 'granted' },
  'org.peacprotocol/privacy': { data_classification: 'confidential' },
  'org.peacprotocol/safety': { review_status: 'reviewed' },
  'org.peacprotocol/compliance': { framework: 'soc2-type2', compliance_status: 'compliant' },
  'org.peacprotocol/provenance': { source_type: 'original' },
  'org.peacprotocol/attribution': { creator_ref: 'acme-corp' },
  'org.peacprotocol/purpose': { external_purposes: ['ai_training'] },
};

/** Commerce extension shorthand (most common in tests) */
export const COMMERCE_EXTENSIONS = {
  'org.peacprotocol/commerce': MINIMAL_FIRST_PARTY_EXTENSIONS['org.peacprotocol/commerce'],
};
