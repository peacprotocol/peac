/**
 * PEAC Protocol Registries
 *
 * AUTO-GENERATED from specs/kernel/registries.json
 * DO NOT EDIT MANUALLY - run: npx tsx scripts/codegen-registries.ts
 * Spec version: 0.6.0
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
    id: 'paymentauth',
    category: 'agentic-payment',
    description: 'The "Payment" HTTP authentication scheme (draft-ryan-httpauth-payment)',
    reference: 'https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/',
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
    id: 'grpc',
    category: 'rpc',
    description: 'gRPC transport with metadata-based receipt carrier',
    reference: 'https://grpc.io/',
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
    id: 'intoto-v1',
    category: 'supply-chain',
    description: 'in-toto Attestation Framework v1.0 predicate mapping',
    reference: 'https://github.com/in-toto/attestation/tree/main/spec/v1',
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
    id: 'slsa-v1.2',
    category: 'supply-chain',
    description: 'SLSA v1.2 provenance predicate mapping',
    reference: 'https://slsa.dev/spec/v1.0/',
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
    id: 'org.peacprotocol/a2a-agent-card-observation',
    pillar: 'provenance',
    description:
      'Observational record of an A2A v1.0 Agent Card discovery; signature_observation is caller-reported.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-human-approved',
    pillar: 'provenance',
    description:
      'Observational record of an A2A v1.0 human approval; PEAC records what an external approver indicated.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-human-rejected',
    pillar: 'provenance',
    description:
      'Observational record of an A2A v1.0 human rejection; PEAC records what an external approver indicated.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-human-review-requested',
    pillar: 'provenance',
    description: 'Observational record of an A2A v1.0 human review request.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-task-accepted',
    pillar: 'provenance',
    description: 'Observational record of an A2A v1.0 task.accepted handoff event.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-task-completed',
    pillar: 'provenance',
    description: 'Observational record of an A2A v1.0 task.completed handoff event.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-task-failed',
    pillar: 'provenance',
    description: 'Observational record of an A2A v1.0 task.failed handoff event.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-task-rejected',
    pillar: 'provenance',
    description: 'Observational record of an A2A v1.0 task.rejected handoff event.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-task-state-changed',
    pillar: 'provenance',
    description: 'Observational record of an A2A v1.0 task state transition.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/a2a-task-submitted',
    pillar: 'provenance',
    description: 'Observational record of an A2A v1.0 task.submitted handoff event.',
    extension_group: 'org.peacprotocol/a2a-handoff',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/access-decision',
    pillar: 'access',
    description: 'Access control decision evidence (allow, deny, review)',
    extension_group: 'org.peacprotocol/access',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/agent-action-approved-observed',
    pillar: 'compliance',
    description:
      'Observational record of an action being approved by an external approver or automated policy. Caller-reported; PEAC does not approve actions. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/agent-action',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/agent-action-cancelled-observed',
    pillar: 'attribution',
    description:
      'Observational record of an action being cancelled. Optional cancelled_by_ref. Caller-reported; PEAC does not cancel actions. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/agent-action',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/agent-action-delegated-observed',
    pillar: 'attribution',
    description:
      'Observational record of an action being delegated to a sub-agent or tool. Requires delegated_to_ref. Caller-reported; PEAC does not delegate actions. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/agent-action',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/agent-action-denied-observed',
    pillar: 'compliance',
    description:
      'Observational record of an action being denied by an external approver or automated policy. Caller-reported; PEAC does not deny actions. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/agent-action',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/agent-action-invoked-observed',
    pillar: 'attribution',
    description:
      'Observational record of an agent being invoked to take an action. Caller-reported; PEAC does not invoke agents. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/agent-action',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/agent-action-timed-out-observed',
    pillar: 'compliance',
    description:
      'Observational record of an action timing out. Optional timeout_at timestamp. Caller-reported; PEAC does not execute or time out actions. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/agent-action',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/attribution-event',
    pillar: 'attribution',
    description: 'Content or action attribution evidence',
    extension_group: 'org.peacprotocol/attribution',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/cli-command-execution',
    pillar: 'provenance',
    description:
      'Observational record of a local CLI command execution; PEAC records what the wrapper observed (argv, stdin/stdout/stderr digests, exit code, signal, timing, capture policy). Field-level variants (exit_code, signal, timed_out, shell_mode, capture_policy, termination_signal, exit_code_mode) live as fields on this single record type, not as separate record types. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/cli-execution',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce-authorization-observed',
    pillar: 'commerce',
    description:
      'Observational record of a payment authorization event scoped to a mandate. Caller-reported; PEAC does not authorize payments or synthesize settlement finality. settlement_state is forbidden on this record kind. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/commerce-mandate',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce-budget-observed',
    pillar: 'commerce',
    description:
      'Observational record of a budget event scoped to a mandate (limit set, limit changed, threshold crossed, period rollover, etc.). Caller-reported; PEAC does not enforce budgets or evaluate budget policy. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/commerce-mandate',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce-capture-observed',
    pillar: 'commerce',
    description:
      'Observational record of a payment capture event scoped to a mandate and authorization. Caller-reported; PEAC does not capture funds. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/commerce-mandate',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce-mandate-observed',
    pillar: 'commerce',
    description:
      'Observational record of a commerce mandate event scoped to a merchant and payer. Caller-reported; PEAC does not enforce mandates or vouch for legal validity. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/commerce-mandate',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce-refund-observed',
    pillar: 'commerce',
    description:
      'Observational record of a refund event scoped to a mandate. Caller-reported; PEAC does not process refunds. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/commerce-mandate',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce-settlement-observed',
    pillar: 'commerce',
    description:
      'Observational record of a settlement event scoped to a mandate, with caller-attested settlement_state (pending / completed / failed / reversed / partial). Caller-reported; PEAC does not settle funds or compute settlement finality. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/commerce-mandate',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce-void-observed',
    pillar: 'commerce',
    description:
      'Observational record of an authorization void event scoped to a mandate. Caller-reported; PEAC does not void authorizations. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/commerce-mandate',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/compliance-check',
    pillar: 'compliance',
    description: 'Regulatory compliance check evidence',
    extension_group: 'org.peacprotocol/compliance',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/consent-record',
    pillar: 'consent',
    description: 'Consent collection or withdrawal evidence',
    extension_group: 'org.peacprotocol/consent',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-facilitator-timeout-observed',
    pillar: 'commerce',
    description:
      'Observational record of a facilitator-timeout trigger event at a payment gateway. Records the timeout boundary signal that may precede unresolved recovery. Caller-reported; PEAC does not contact facilitators, enforce timeouts, or trigger recovery. Not a settlement state. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/gateway-export',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-payment-submitted-observed',
    pillar: 'commerce',
    description:
      'Observational record of a payment-submitted event at a payment gateway or facilitator. Caller-reported; PEAC does not submit, route, or settle payments. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/gateway-export',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-settlement-confirmed-late-observed',
    pillar: 'commerce',
    description:
      'Observational record of a settlement-confirmed-late state at a payment gateway (confirmation observed after the original facilitator timeout window). Caller-reported; PEAC does not verify on-chain settlement or compute lateness. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/gateway-export',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-settlement-confirmed-observed',
    pillar: 'commerce',
    description:
      'Observational record of a settlement-confirmed state at a payment gateway. Caller-reported; PEAC does not verify on-chain settlement or vouch for finality. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/gateway-export',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-settlement-failed-observed',
    pillar: 'commerce',
    description:
      'Observational record of a settlement-failed state at a payment gateway (transaction reverted or rejected). Caller-reported; PEAC does not adjudicate failure cause. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/gateway-export',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-settlement-failed-orphaned-observed',
    pillar: 'commerce',
    description:
      'Observational record of a settlement-failed-orphaned state at a payment gateway (polling exhausted, transaction not found on chain). Caller-reported; PEAC does not adjudicate orphan status or chain visibility. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/gateway-export',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-settlement-polling-observed',
    pillar: 'commerce',
    description:
      'Observational record of an active polling state at a payment gateway. Records caller-reported polling activity (poll_count + polling_strategy categorization). Caller-reported; PEAC does not poll chains or run recovery loops. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/gateway-export',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-settlement-unresolved-observed',
    pillar: 'commerce',
    description:
      'Observational record of a settlement-unresolved state at a payment gateway (recovery began but outcome is not yet known). Caller-reported; PEAC does not poll chains or resolve settlement. Introduced in v0.14.3.',
    extension_group: 'org.peacprotocol/gateway-export',
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
    id: 'org.peacprotocol/lifecycle-approval-denied',
    pillar: 'provenance',
    description:
      'Observational record that an external approver denied; the caller observed the denial, the CLI issues the record using the caller-provided issuer key. PEAC does not deny. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/lifecycle-observation',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-approval-granted',
    pillar: 'provenance',
    description:
      'Observational record that an external approver granted; the caller observed the grant, the CLI issues the record using the caller-provided issuer key. PEAC does not grant. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/lifecycle-observation',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-approval-requested',
    pillar: 'provenance',
    description:
      'Observational record of an external lifecycle approval request; the caller observed the request, the CLI issues the record using the caller-provided issuer key. PEAC does not approve. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/lifecycle-observation',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-evaluation-completed',
    pillar: 'provenance',
    description:
      'Observational record that an external evaluation system completed an evaluation; carries result_ref pointing to a stored result artifact. PEAC does not score. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/lifecycle-observation',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-evaluation-started',
    pillar: 'provenance',
    description:
      'Observational record that an external evaluation system started an evaluation; the caller observed the start. PEAC does not evaluate. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/lifecycle-observation',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-experiment-assigned',
    pillar: 'provenance',
    description:
      'Observational record that an external experimentation system assigned a subject to an experiment cohort/variant. PEAC does not run experiments. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/lifecycle-observation',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-experiment-result',
    pillar: 'provenance',
    description:
      'Observational record of an external experiment result; carries experiment_ref and result_ref. PEAC does not score experiments. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/lifecycle-observation',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-mode-observed',
    pillar: 'provenance',
    description:
      "Observational record of an external runtime's execution-mode tag (deterministic_script, templated_flow, agent_loop, human_step, hybrid). The caller observed the mode; the CLI records it. Introduced in v0.14.1.",
    extension_group: 'org.peacprotocol/lifecycle-observation',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-workflow-transition',
    pillar: 'provenance',
    description:
      'Observational record of a state transition emitted by an external workflow engine or orchestrator (from_state -> to_state). PEAC does not orchestrate, schedule, or assign work. Introduced in v0.14.1.',
    extension_group: 'org.peacprotocol/lifecycle-observation',
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
    extension_group: 'org.peacprotocol/privacy',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provenance-record',
    pillar: 'provenance',
    description: 'Data or content provenance tracking evidence',
    extension_group: 'org.peacprotocol/provenance',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-account-observed',
    pillar: 'provenance',
    description:
      'Observational record of an account-scope sub_event (created / linked / authorized / updated). Caller-reported state; PEAC records what the issuer attests. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-budget-observed',
    pillar: 'provenance',
    description:
      'Observational record of a budget reference and limits digest. PEAC does not enforce budgets; it records caller-reported budget state. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-catalog-observed',
    pillar: 'provenance',
    description:
      'Observational record of catalog discovery: an agent retrieved a service catalog entry, terms, or pricing manifest from a provider. PEAC carries the retrieval timestamp and digests of the upstream artifacts; it does not validate the catalog or vouch for terms. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-credential-observed',
    pillar: 'provenance',
    description:
      'Observational record of a credential-scope sub_event (issued / rotated / revoked / synced) with a generic storage_surface object describing where credential material is held. PEAC never captures credential material; the schema enforces no-inline-credential and no-token-material invariants recursively. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-deployment-observed',
    pillar: 'provenance',
    description:
      'Observational record of a deployment-scope sub_event (started / completed / failed / rolled_back). Caller-reported deployment outcome; PEAC does not deploy or supervise runtime state. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-domain-observed',
    pillar: 'provenance',
    description:
      'Observational record of a domain-scope sub_event (registered / transferred / released). Caller-reported registry interaction; PEAC does not perform domain operations. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-payment-authorization-observed',
    pillar: 'provenance',
    description:
      'Observational record of a payment-authorization sub_event (observed / granted / revoked / expired / consumed). Carries bounded scheme_id (or opaque scheme_ref), authorization_ref, optional non-negative max_amount_minor, optional expires_at, and material_redaction policy. PEAC does not implement payment schemes or vouch for authorization correctness. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-provider-link-observed',
    pillar: 'provenance',
    description:
      'Observational record of a provider link being established or refreshed (account / scheme / token surface). Carries opaque provider account_ref and scheme identity; PEAC does not link, authenticate, or authorize. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-resource-observed',
    pillar: 'provenance',
    description:
      'Observational record of a resource-scope sub_event (requested / provisioned / updated / removed). PEAC does not provision resources; it records caller-reported provisioning outcomes. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-subscription-observed',
    pillar: 'provenance',
    description:
      'Observational record of a subscription-scope sub_event (started / updated / cancelled). Caller-reported lifecycle; PEAC does not manage subscription billing. Introduced in v0.14.2.',
    extension_group: 'org.peacprotocol/provisioning-lifecycle',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/purpose-declaration',
    pillar: 'purpose',
    description: 'Purpose declaration or limitation evidence',
    extension_group: 'org.peacprotocol/purpose',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/safety-review',
    pillar: 'safety',
    description: 'Content or agent safety review evidence',
    extension_group: 'org.peacprotocol/safety',
    status: 'informational',
  },
];

/** Extension group registry (Wire 0.2) */
export const EXTENSION_GROUPS: readonly ExtensionGroupEntry[] = [
  {
    id: 'org.peacprotocol/a2a-handoff',
    description:
      'A2A handoff observation extension: records observational events emitted alongside A2A v1.0 task lifecycle transitions (Agent Card observation + 9 task-lifecycle event types). Strictly observational; helpers do not verify Agent Card signatures or fetch upstream events. Introduced in v0.14.1.',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/access',
    description: 'Access extension: resource, action, decision (allow/deny/review)',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/agent-action',
    description:
      'Agent action records extension: records observational evidence of agent action events reported by a caller, harness, or runtime. Per-event-kind discriminated union covers six *-observed event kinds (invoked / delegated / approved / denied / cancelled / timed-out). Grammar-based no-inline-content invariant rejects 20 forbidden top-level keys (prompt/message/messages/body/input/output/result/response/completion/stdout/stderr/env/secret/token/api_key/private_key/credential/model_output/tool_input/tool_output); all *_ref fields validated by the OpaqueRefSchema grammar. Action decisions (approved / denied) are reported by the caller; the record describes what the caller observed, not what PEAC decided. PEAC does not approve, deny, authorize, schedule, execute, govern, enforce, monitor, score, or orchestrate actions. Introduced in v0.14.3.',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/attribution',
    description:
      'Attribution extension: creator_ref, license_spdx, obligation_type, attribution_text, content_signal_source, content_digest',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/challenge',
    description: 'Challenge extension: challenge_type, problem (RFC 9457), requirements',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/cli-execution',
    description:
      'CLI execution observation extension: records observational evidence of a local command execution wrapped by the peac observe command / record command subcommands. Hard security defaults (argv hashed; stdout/stderr length+sha256+truncated only; env deny-by-default; cwd hashed; binary path hashed; secret-scan on; shell-binary detected without --shell-mode hard-fails). The wrapper is an observer, not a sandbox / permission system / process supervisor / job scheduler / shell orchestrator. Introduced in v0.14.1.',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce',
    description: 'Commerce extension: payment_rail, amount_minor, currency, reference, asset, env',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/commerce-mandate',
    description:
      'Commerce mandate records extension: records observational evidence of commerce-lifecycle events (mandate / authorization / capture / void / refund / settlement / budget) scoped to a mandate. Per-event-kind discriminated union covers seven *-observed event kinds. Grammar-based no-inline-payment-data invariant rejects 20 forbidden top-level keys (card_number / pan / cvv / cvc / expiry_date / card_holder_name / billing_address / shipping_address / token / raw_token / bearer_token / api_key / secret / private_key / private_key_pem / credential / password / connection_string / iban / bank_account) with commerce.mandate.inline_payment_data_blocked; all *_ref fields validated by the OpaqueRefSchema grammar; all amount fields use AmountMinorStringSchema (base-10 integer string; numeric and decimal forms rejected). Finality-synthesis boundary: settlement_state on any non-settlement event kind rejects with commerce.mandate.finality_synthesis_blocked. scheme_id (bounded grammar) and scheme_ref (opaque) are mutually exclusive. PEAC does not authorize payments, process payments, settle funds, enforce mandates, compute payment finality, evaluate budgets, validate payment rails, or vouch for the legal validity of any commerce decision. Introduced in v0.14.3.',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/compliance',
    description:
      'Compliance extension: framework, compliance_status, audit_ref, auditor, audit_date, scope, validity_period, evidence_ref',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/consent',
    description:
      'Consent extension: consent_basis, consent_status, data_categories, retention_period, consent_method, withdrawal_uri, scope, jurisdiction',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/correlation',
    description: 'Correlation extension: trace_id, span_id, workflow_id, parent_jti, depends_on',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/gateway-export',
    description:
      'Gateway export records extension: records caller-reported observations of payment-gateway / facilitator settlement-recovery events. Eight *-observed event kinds: seven settlement/recovery state observations plus one facilitator-timeout trigger observation. PEAC does not introduce a new settlement state. Single canonical money field amount_minor uses the shared AmountMinorStringSchema grammar wrapped in a Gateway Export non-negative profile constraint (negative values reject with gateway.export.invalid_amount_minor); no separate value_minor field is defined (records carrying value_minor reject as gateway.export.unknown_field via the strict variant schema). 19 forbidden top-level payment-data keys reject with gateway.export.inline_payment_data_blocked; all *_ref fields validated by OpaqueRefSchema; bounded string fields enforce UTF-8 byte limits. timeout_profile closed enum aligned with upstream environment profiles (datacenter / east_africa_3g / west_africa_3g / custom); caller-reported labels (no geography inference); custom requires facilitator_timeout_ms + poll_interval_ms + max_poll_window_ms. polling_strategy is a PEAC observer categorization, not an upstream enum. Optional valid_before_unix_seconds (caller-reported EIP-3009 expiry) and optional EIP-3009 four-tuple references (payer_ref / pay_to_ref / nonce_ref) with the value component carried by amount_minor. PEAC does not settle transactions, route payments, contact gateways, verify on-chain state, monitor settlements, enforce recovery policy, or resolve settlement disputes. Full normative profile at docs/specs/GATEWAY-EXPORT-RECORDS.md. Introduced in v0.14.3.',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/identity',
    description: 'Identity extension: proof_ref',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/lifecycle-observation',
    description:
      "Lifecycle observation extension: records observations of lifecycle events emitted by external systems (orchestrators, workflow engines, evaluation systems, approval systems, agent runtimes). Backs the peac emit lifecycle subcommand. The caller observed the event; the CLI issues the record using the caller-provided issuer key; the caller's issuer is the signer-of-record. Per-event-kind discriminated union covers approval / evaluation / experiment / workflow_transition / mode_observed. Grammar-based no-inline-value invariant rejects 20 forbidden top-level keys (decision/verdict/score/result/passed/failed/policy_result/approval_result/outcome/judgment/rating/grade/pass/fail/allow/deny/authorized/denied/granted/rejected_reason); all *_ref fields validated by the OpaqueRefSchema grammar (approver_ref @-detection prioritized as a PII-blocked subclass). PEAC does not approve, evaluate, score, transition, orchestrate, schedule, or vouch for the truth of the event. Introduced in v0.14.1.",
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/privacy',
    description:
      'Privacy extension: data_classification, processing_basis, retention_period, retention_mode, recipient_scope, anonymization_method, data_subject_category, transfer_mechanism',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provenance',
    description:
      'Provenance extension: source_type, source_ref, source_uri, build_provenance_uri, verification_method, custody_chain, slsa',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/provisioning-lifecycle',
    description:
      'Provisioning lifecycle observation extension: records observations of lifecycle events emitted when an agent or agent-driven workflow provisions services, accounts, resources, credentials, payment authorizations, budgets, subscriptions, domains, or deployments through external providers. Per-event-kind discriminated union covers ten *-observed event families (catalog / provider-link / account / resource / credential / payment-authorization / budget / subscription / domain / deployment). Granular sub-states (created/linked/granted/revoked/issued/rotated/etc.) live as <scope>.sub_event fields inside each scope object, NOT as separate type URIs. No-credential-leak invariant rejects 20 forbidden top-level credential-bearing keys with provisioning.inline_credential_blocked; a recursive secret-scanner walker rejects credential-shaped values and forbidden key names at any depth with provisioning.token_material_blocked / provisioning.forbidden_key_name. Generic storage_surface object with abstract kind enum (no vendor-specific values). Bounded scheme_id grammar with opaque scheme_ref alternative. PEAC does not authorize the action, verify legal acceptance, provision resources, validate credentials, process payments, vouch for provider state, settle transactions, manage credential vaults, or operate the runtime. PEAC does not implement OAuth, DPoP, OAuth Protected Resource Metadata, or Shared Payment Tokens. Introduced in v0.14.2.',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/purpose',
    description:
      'Purpose extension: external_purposes, purpose_basis, purpose_limitation, data_minimization, compatible_purposes, peac_purpose_mapping',
    status: 'informational',
  },
  {
    id: 'org.peacprotocol/safety',
    description:
      'Safety extension: review_status, risk_level, assessment_method, safety_measures, incident_ref, model_ref, category',
    status: 'informational',
  },
];

/**
 * Type-to-extension group mapping for first-party receipt types.
 * Used by @peac/protocol.verifyLocal() for type-to-extension enforcement.
 * Entries with extension_group === null are excluded (no enforcement yet).
 */
export const TYPE_TO_EXTENSION_MAP: ReadonlyMap<string, string> = new Map([
  ['org.peacprotocol/a2a-agent-card-observation', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-human-approved', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-human-rejected', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-human-review-requested', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-task-accepted', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-task-completed', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-task-failed', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-task-rejected', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-task-state-changed', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/a2a-task-submitted', 'org.peacprotocol/a2a-handoff'],
  ['org.peacprotocol/access-decision', 'org.peacprotocol/access'],
  ['org.peacprotocol/agent-action-approved-observed', 'org.peacprotocol/agent-action'],
  ['org.peacprotocol/agent-action-cancelled-observed', 'org.peacprotocol/agent-action'],
  ['org.peacprotocol/agent-action-delegated-observed', 'org.peacprotocol/agent-action'],
  ['org.peacprotocol/agent-action-denied-observed', 'org.peacprotocol/agent-action'],
  ['org.peacprotocol/agent-action-invoked-observed', 'org.peacprotocol/agent-action'],
  ['org.peacprotocol/agent-action-timed-out-observed', 'org.peacprotocol/agent-action'],
  ['org.peacprotocol/attribution-event', 'org.peacprotocol/attribution'],
  ['org.peacprotocol/cli-command-execution', 'org.peacprotocol/cli-execution'],
  ['org.peacprotocol/commerce-authorization-observed', 'org.peacprotocol/commerce-mandate'],
  ['org.peacprotocol/commerce-budget-observed', 'org.peacprotocol/commerce-mandate'],
  ['org.peacprotocol/commerce-capture-observed', 'org.peacprotocol/commerce-mandate'],
  ['org.peacprotocol/commerce-mandate-observed', 'org.peacprotocol/commerce-mandate'],
  ['org.peacprotocol/commerce-refund-observed', 'org.peacprotocol/commerce-mandate'],
  ['org.peacprotocol/commerce-settlement-observed', 'org.peacprotocol/commerce-mandate'],
  ['org.peacprotocol/commerce-void-observed', 'org.peacprotocol/commerce-mandate'],
  ['org.peacprotocol/compliance-check', 'org.peacprotocol/compliance'],
  ['org.peacprotocol/consent-record', 'org.peacprotocol/consent'],
  ['org.peacprotocol/gateway-facilitator-timeout-observed', 'org.peacprotocol/gateway-export'],
  ['org.peacprotocol/gateway-payment-submitted-observed', 'org.peacprotocol/gateway-export'],
  [
    'org.peacprotocol/gateway-settlement-confirmed-late-observed',
    'org.peacprotocol/gateway-export',
  ],
  ['org.peacprotocol/gateway-settlement-confirmed-observed', 'org.peacprotocol/gateway-export'],
  ['org.peacprotocol/gateway-settlement-failed-observed', 'org.peacprotocol/gateway-export'],
  [
    'org.peacprotocol/gateway-settlement-failed-orphaned-observed',
    'org.peacprotocol/gateway-export',
  ],
  ['org.peacprotocol/gateway-settlement-polling-observed', 'org.peacprotocol/gateway-export'],
  ['org.peacprotocol/gateway-settlement-unresolved-observed', 'org.peacprotocol/gateway-export'],
  ['org.peacprotocol/identity-attestation', 'org.peacprotocol/identity'],
  ['org.peacprotocol/lifecycle-approval-denied', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/lifecycle-approval-granted', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/lifecycle-approval-requested', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/lifecycle-evaluation-completed', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/lifecycle-evaluation-started', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/lifecycle-experiment-assigned', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/lifecycle-experiment-result', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/lifecycle-mode-observed', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/lifecycle-workflow-transition', 'org.peacprotocol/lifecycle-observation'],
  ['org.peacprotocol/payment', 'org.peacprotocol/commerce'],
  ['org.peacprotocol/privacy-signal', 'org.peacprotocol/privacy'],
  ['org.peacprotocol/provenance-record', 'org.peacprotocol/provenance'],
  ['org.peacprotocol/provisioning-account-observed', 'org.peacprotocol/provisioning-lifecycle'],
  ['org.peacprotocol/provisioning-budget-observed', 'org.peacprotocol/provisioning-lifecycle'],
  ['org.peacprotocol/provisioning-catalog-observed', 'org.peacprotocol/provisioning-lifecycle'],
  ['org.peacprotocol/provisioning-credential-observed', 'org.peacprotocol/provisioning-lifecycle'],
  ['org.peacprotocol/provisioning-deployment-observed', 'org.peacprotocol/provisioning-lifecycle'],
  ['org.peacprotocol/provisioning-domain-observed', 'org.peacprotocol/provisioning-lifecycle'],
  [
    'org.peacprotocol/provisioning-payment-authorization-observed',
    'org.peacprotocol/provisioning-lifecycle',
  ],
  [
    'org.peacprotocol/provisioning-provider-link-observed',
    'org.peacprotocol/provisioning-lifecycle',
  ],
  ['org.peacprotocol/provisioning-resource-observed', 'org.peacprotocol/provisioning-lifecycle'],
  [
    'org.peacprotocol/provisioning-subscription-observed',
    'org.peacprotocol/provisioning-lifecycle',
  ],
  ['org.peacprotocol/purpose-declaration', 'org.peacprotocol/purpose'],
  ['org.peacprotocol/safety-review', 'org.peacprotocol/safety'],
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
