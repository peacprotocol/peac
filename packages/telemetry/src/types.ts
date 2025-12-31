/**
 * @peac/telemetry - Telemetry types and interfaces
 *
 * This module defines the core telemetry interfaces for PEAC protocol.
 * These are runtime-portable and have no external dependencies.
 */

/**
 * Telemetry decision outcome
 */
export type TelemetryDecision = 'allow' | 'deny' | 'unknown';

/**
 * Privacy mode for telemetry emission
 *
 * - strict: Hash all identifiers, emit minimal data (production default)
 * - balanced: Hash identifiers but include rail + amounts (debugging)
 * - custom: Use allowlist-based filtering
 */
export type PrivacyMode = 'strict' | 'balanced' | 'custom';

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  /** Service name for resource identification */
  serviceName: string;

  /** Privacy mode: strict (hashes only), balanced, custom */
  privacyMode?: PrivacyMode;

  /** Allowlist for custom mode - only these attribute keys are emitted */
  allowAttributes?: string[];

  /** Custom redaction hook for edge cases */
  redact?: (attrs: Record<string, unknown>) => Record<string, unknown>;

  /** Enable experimental GenAI semantic conventions (default: false) */
  enableExperimentalGenAI?: boolean;
}

/**
 * Input for receipt issued telemetry event
 */
export interface ReceiptIssuedInput {
  /** Hash of the receipt (never raw content) */
  receiptHash: string;

  /** Hash of the policy used */
  policyHash?: string;

  /** Issuer identifier (may be hashed based on privacy mode) */
  issuer?: string;

  /** Key ID used for signing */
  kid?: string;

  /** HTTP context (privacy-safe: path only, no query) */
  http?: HttpContext;

  /** Duration of issue operation in milliseconds */
  durationMs?: number;
}

/**
 * Input for receipt verified telemetry event
 */
export interface ReceiptVerifiedInput {
  /** Hash of the receipt */
  receiptHash: string;

  /** Issuer identifier */
  issuer?: string;

  /** Key ID used */
  kid?: string;

  /** Whether verification succeeded */
  valid: boolean;

  /** Reason code if verification failed */
  reasonCode?: string;

  /** HTTP context */
  http?: HttpContext;

  /** Duration of verify operation in milliseconds */
  durationMs?: number;
}

/**
 * Input for access decision telemetry event
 */
export interface AccessDecisionInput {
  /** Hash of the receipt (if present) */
  receiptHash?: string;

  /** Hash of the policy evaluated */
  policyHash?: string;

  /** Decision outcome */
  decision: TelemetryDecision;

  /** Reason code for the decision */
  reasonCode?: string;

  /** Payment context (balanced/custom mode only) */
  payment?: PaymentContext;

  /** HTTP context */
  http?: HttpContext;
}

/**
 * HTTP context for telemetry (privacy-safe subset)
 */
export interface HttpContext {
  /** HTTP method */
  method?: string;

  /** URL path (no query string) */
  path?: string;
}

/**
 * Payment context for telemetry (balanced/custom mode only)
 */
export interface PaymentContext {
  /** Payment rail identifier */
  rail?: string;

  /** Amount in minor units */
  amount?: number;

  /** Currency code */
  currency?: string;
}

/**
 * Telemetry provider interface
 *
 * Implementations SHOULD be no-throw. PEAC guards all calls,
 * but well-behaved providers should not throw.
 */
export interface TelemetryProvider {
  /**
   * Called when a receipt is issued
   */
  onReceiptIssued(input: ReceiptIssuedInput): void;

  /**
   * Called when a receipt is verified
   */
  onReceiptVerified(input: ReceiptVerifiedInput): void;

  /**
   * Called when an access decision is made
   */
  onAccessDecision(input: AccessDecisionInput): void;
}
