/**
 * PEAC Protocol Registries
 *
 * AUTO-GENERATED from specs/kernel/registries.json
 * DO NOT EDIT MANUALLY - run: npx tsx scripts/codegen-registries.ts
 * Spec version: 0.5.0
 */

import type {
  PaymentRailEntry,
  ControlEngineEntry,
  TransportMethodEntry,
  AgentProtocolEntry,
} from './types.js';

/** Proof type registry entry */
export interface ProofTypeEntry {
  id: string;
  category: string;
  description: string;
  reference: string | null;
  status: string;
}

/** Receipt type registry entry (Wire 0.2) */
export interface ReceiptTypeEntry {
  id: string;
  pillar: string;
  description: string;
  extension_group: string | null;
  status: string;
}

/** Extension group registry entry (Wire 0.2) */
export interface ExtensionGroupEntry {
  id: string;
  description: string;
  status: string;
}

/** payment rails registry */
export const PAYMENT_RAILS: readonly PaymentRailEntry[] = [
  {
    id: 'card-network',
    category: 'card',
    description: 'Generic card network authorizations/clearing',
    reference: null,
    status: 'informational',
  },
  {
    id: 'l402',
    category: 'agentic-payment',
    description: 'Lightning HTTP 402 Protocol (LSAT-based)',
    reference: 'https://docs.lightning.engineering/the-lightning-network/l402',
    status: 'informational',
  },
  {
    id: 'razorpay',
    category: 'payment-gateway',
    description: 'Razorpay payment gateway (UPI, cards, netbanking, wallets)',
    reference: 'https://razorpay.com/docs/',
    status: 'informational',
  },
  {
    id: 'stripe',
    category: 'payment-gateway',
    description: 'Stripe payment processing',
    reference: 'https://stripe.com/docs',
    status: 'informational',
  },
  {
    id: 'upi',
    category: 'account-to-account',
    description: 'Unified Payments Interface',
    reference: 'https://www.npci.org.in/',
    status: 'informational',
  },
  {
    id: 'x402',
    category: 'agentic-payment',
    description: 'HTTP 402-based paid call receipts',
    reference: 'https://www.x402.org/',
    status: 'informational',
  },
];

/** control engines registry */
export const CONTROL_ENGINES: readonly ControlEngineEntry[] = [
  {
    id: 'mandate-service',
    category: 'mandate',
    description: 'Generic enterprise mandate/approval chain evaluator',
    reference: null,
    status: 'informational',
  },
  {
    id: 'risk-engine',
    category: 'fraud',
    description: 'Generic risk/fraud scoring engine',
    reference: null,
    status: 'informational',
  },
  {
    id: 'rsl',
    category: 'access-policy',
    description: 'Robots Specification Layer usage token evaluation',
    reference: null,
    status: 'informational',
  },
  {
    id: 'spend-control-service',
    category: 'limits',
    description: 'Generic spend control decisions (per-tx, daily, monthly limits)',
    reference: null,
    status: 'informational',
  },
  {
    id: 'tap',
    category: 'agent-verification',
    description: 'Trusted Agent Protocol control decisions (HTTP signature verification)',
    reference: 'https://developer.visa.com/',
    status: 'informational',
  },
];

/** transport methods registry */
export const TRANSPORT_METHODS: readonly TransportMethodEntry[] = [
  {
    id: 'dpop',
    category: 'proof-of-possession',
    description: 'Demonstrating Proof-of-Possession at the Application Layer',
    reference: 'https://www.rfc-editor.org/rfc/rfc9449',
    status: 'informational',
  },
  {
    id: 'http-signature',
    category: 'message-signature',
    description: 'HTTP Message Signatures',
    reference: 'https://www.rfc-editor.org/rfc/rfc9421',
    status: 'informational',
  },
  {
    id: 'none',
    category: 'none',
    description: 'No transport binding',
    reference: null,
    status: 'informational',
  },
];

/** agent protocols registry */
export const AGENT_PROTOCOLS: readonly AgentProtocolEntry[] = [
  {
    id: 'a2a',
    category: 'agent-protocol',
    description: 'Agent-to-Agent Protocol (A2A, Linux Foundation)',
    reference: 'https://a2a-protocol.org/',
    status: 'informational',
  },
  {
    id: 'acp',
    category: 'commerce-protocol',
    description: 'Agentic Commerce Protocol',
    reference: null,
    status: 'informational',
  },
  {
    id: 'ap2',
    category: 'agent-protocol',
    description: 'Google Agent Protocol v2',
    reference: null,
    status: 'informational',
  },
  {
    id: 'mcp',
    category: 'tool-protocol',
    description: 'Model Context Protocol (MCP)',
    reference: 'https://modelcontextprotocol.io/',
    status: 'informational',
  },
  {
    id: 'tap',
    category: 'card-protocol',
    description: 'Trusted Agent Protocol (Visa TAP)',
    reference: 'https://developer.visa.com/',
    status: 'informational',
  },
  {
    id: 'ucp',
    category: 'commerce-protocol',
    description: 'Universal Commerce Protocol (UCP)',
    reference: null,
    status: 'informational',
  },
];

/** proof types registry */
export const PROOF_TYPES: readonly ProofTypeEntry[] = [
  {
    id: 'custom',
    category: 'vendor-defined',
    description: 'Vendor-defined proof type; registered per-issuer in extension metadata',
    reference: null,
    status: 'informational',
  },
  {
    id: 'did',
    category: 'decentralized-identity',
    description: 'W3C Decentralized Identifier (DID) resolution and verification',
    reference: 'https://www.w3.org/TR/did-core/',
    status: 'informational',
  },
  {
    id: 'eat-background-check',
    category: 'rats',
    description:
      'Verifier fetches attestation result from registry in RATS Background-Check model (RFC 9711)',
    reference: 'https://www.rfc-editor.org/rfc/rfc9711',
    status: 'informational',
  },
  {
    id: 'eat-passport',
    category: 'rats',
    description: 'Agent carries Entity Attestation Token in RATS Passport model (RFC 9711)',
    reference: 'https://www.rfc-editor.org/rfc/rfc9711',
    status: 'informational',
  },
  {
    id: 'ed25519-cert-chain',
    category: 'attestation-chain',
    description: 'Ed25519 issuer-to-holder attestation chain (RFC 8032)',
    reference: 'https://www.rfc-editor.org/rfc/rfc8032',
    status: 'informational',
  },
  {
    id: 'sigstore-oidc',
    category: 'keyless-signing',
    description: 'OIDC-bound keyless signing via Sigstore (Fulcio + Rekor transparency log)',
    reference: 'https://docs.sigstore.dev/',
    status: 'informational',
  },
  {
    id: 'spiffe',
    category: 'workload-identity',
    description: 'CNCF SPIFFE workload identity (spiffe:// URI scheme)',
    reference: 'https://spiffe.io/docs/latest/spiffe-about/overview/',
    status: 'informational',
  },
  {
    id: 'x509-pki',
    category: 'pki',
    description: 'Traditional X.509 PKI certificate chain verification (RFC 5280)',
    reference: 'https://www.rfc-editor.org/rfc/rfc5280',
    status: 'informational',
  },
];

/** Receipt type registry (Wire 0.2, 10 pillar-aligned types) */
export const RECEIPT_TYPES: readonly ReceiptTypeEntry[] = [
  {
    id: 'org.peacprotocol/access-decision',
    pillar: 'access',
    description: 'Access control decision evidence (allow, deny, review)',
    extension_group: 'org.peacprotocol/access',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/attribution-event',
    pillar: 'attribution',
    description: 'Content or action attribution evidence',
    extension_group: null,
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/compliance-check',
    pillar: 'compliance',
    description: 'Regulatory compliance check evidence',
    extension_group: null,
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/consent-record',
    pillar: 'consent',
    description: 'Consent collection or withdrawal evidence',
    extension_group: null,
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/identity-attestation',
    pillar: 'identity',
    description: 'Identity verification or attestation evidence',
    extension_group: 'org.peacprotocol/identity',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/payment',
    pillar: 'commerce',
    description: 'Commerce transaction evidence (payment, authorization, settlement)',
    extension_group: 'org.peacprotocol/commerce',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/privacy-signal',
    pillar: 'privacy',
    description: 'Privacy signal observation or enforcement evidence',
    extension_group: null,
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provenance-record',
    pillar: 'provenance',
    description: 'Data or content provenance tracking evidence',
    extension_group: null,
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/purpose-declaration',
    pillar: 'purpose',
    description: 'Purpose declaration or limitation evidence',
    extension_group: null,
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/safety-review',
    pillar: 'safety',
    description: 'Content or agent safety review evidence',
    extension_group: null,
    status: 'informational',
  },
];

/** Extension group registry (Wire 0.2) */
export const EXTENSION_GROUPS: readonly ExtensionGroupEntry[] = [
  {
    id: 'org.peacprotocol/access',
    description: 'Access extension: resource, action, decision (allow/deny/review)',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/challenge',
    description: 'Challenge extension: challenge_type, problem (RFC 9457), requirements',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce',
    description: 'Commerce extension: payment_rail, amount_minor, currency, reference, asset, env',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/correlation',
    description: 'Correlation extension: trace_id, span_id, workflow_id, parent_jti, depends_on',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/identity',
    description: 'Identity extension: proof_ref',
    status: 'informational',
  },
];

/**
 * Type-to-extension group mapping for first-party receipt types.
 * Used by @peac/protocol.verifyLocal() for type-to-extension enforcement (DD-173.3).
 * Entries with extension_group === null are excluded (no enforcement yet).
 */
export const TYPE_TO_EXTENSION_MAP: ReadonlyMap<string, string> = new Map([
  ['org.peacprotocol/access-decision', 'org.peacprotocol/access'],
  ['org.peacprotocol/identity-attestation', 'org.peacprotocol/identity'],
  ['org.peacprotocol/payment', 'org.peacprotocol/commerce'],
]);

/** Closed pillar vocabulary (10 values, sorted alphabetically) */
export const PILLAR_VALUES = [
  'access',
  'attribution',
  'commerce',
  'compliance',
  'consent',
  'identity',
  'privacy',
  'provenance',
  'purpose',
  'safety',
] as const;

/** All registries export */
export const REGISTRIES = {
  payment_rails: PAYMENT_RAILS,
  control_engines: CONTROL_ENGINES,
  transport_methods: TRANSPORT_METHODS,
  agent_protocols: AGENT_PROTOCOLS,
  proof_types: PROOF_TYPES,
  receipt_types: RECEIPT_TYPES,
  extension_groups: EXTENSION_GROUPS,
  pillar_values: PILLAR_VALUES,
} as const;

/** Find paymentrail by ID */
export function findPaymentRail(id: string): PaymentRailEntry | undefined {
  return PAYMENT_RAILS.find((entry) => entry.id === id);
}

/** Find controlengine by ID */
export function findControlEngine(id: string): ControlEngineEntry | undefined {
  return CONTROL_ENGINES.find((entry) => entry.id === id);
}

/** Find transportmethod by ID */
export function findTransportMethod(id: string): TransportMethodEntry | undefined {
  return TRANSPORT_METHODS.find((entry) => entry.id === id);
}

/** Find agentprotocol by ID */
export function findAgentProtocol(id: string): AgentProtocolEntry | undefined {
  return AGENT_PROTOCOLS.find((entry) => entry.id === id);
}

/** Find prooftype by ID */
export function findProofType(id: string): ProofTypeEntry | undefined {
  return PROOF_TYPES.find((entry) => entry.id === id);
}

/** Find receipt type by ID */
export function findReceiptType(id: string): ReceiptTypeEntry | undefined {
  return RECEIPT_TYPES.find((entry) => entry.id === id);
}

/** Find extension group by ID */
export function findExtensionGroup(id: string): ExtensionGroupEntry | undefined {
  return EXTENSION_GROUPS.find((entry) => entry.id === id);
}
