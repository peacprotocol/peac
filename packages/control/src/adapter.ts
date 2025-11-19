/**
 * PEAC Control Engine Adapter Interface
 *
 * Minimal, vendor-neutral interface for control engine implementations.
 * Control engines evaluate authorization policies and return allow/deny decisions.
 *
 * @packageDocumentation
 */

import type { ControlStep } from '@peac/schema';

/**
 * Context provided to control engine for evaluation
 *
 * This is the minimal context needed for most control engines.
 * Engines may require additional context via the `policy` field.
 */
export interface ControlEvaluationContext {
  /** Resource being accessed (e.g., "https://api.example.com/v1/chat") */
  resource: string;

  /** HTTP method or operation (e.g., "POST", "read", "write") */
  method: string;

  /** Requested payment amount (smallest currency unit), if applicable */
  amount?: number;

  /** Currency (ISO 4217), if applicable */
  currency?: string;

  /** Subject identifier (e.g., agent ID, user ID) */
  subject?: string;

  /** Policy document fetched from policy_uri (engine-specific structure) */
  policy: unknown;

  /** Current timestamp (Unix seconds) for temporal checks */
  timestamp?: number;

  /** Additional context (engine-specific) */
  [key: string]: unknown;
}

/**
 * Control Engine Adapter
 *
 * Minimal interface that all control engines must implement.
 *
 * **Design principles**:
 * - Vendor-neutral: No hardcoded engine names or vendor-specific types
 * - Stateless: Engine is responsible for fetching its own state if needed
 * - Async: Allows engines to make network calls (fetch policies, check quotas)
 * - Opaque: Policy structure is engine-specific (unknown type)
 *
 * **Examples of engines**:
 * - Spend control: Per-transaction, daily, monthly limits
 * - Risk scoring: Fraud detection, anomaly detection
 * - Mandate enforcement: Enterprise approval chains
 * - Rate limiting: Request quotas, throttling
 *
 * **Usage**:
 * ```typescript
 * const engine: ControlEngineAdapter = new MyControlEngine();
 * const step = await engine.evaluate({
 *   resource: "https://api.example.com/v1/chat",
 *   method: "POST",
 *   amount: 250,
 *   currency: "USD",
 *   policy: { ... }  // Fetched from policy_uri
 * });
 * ```
 */
export interface ControlEngineAdapter {
  /**
   * Engine identifier (vendor-neutral)
   *
   * Examples:
   * - "spend-control-service"
   * - "risk-engine"
   * - "mandate-service"
   *
   * See docs/specs/registries.json for common identifiers.
   */
  readonly engineId: string;

  /**
   * Engine version (optional, for tracking)
   *
   * Format: Semantic versioning (e.g., "1.2.3")
   */
  readonly version?: string;

  /**
   * Evaluate authorization policy and return control decision
   *
   * @param context - Evaluation context (resource, method, amount, policy, etc.)
   * @returns Control step with decision (allow/deny) and optional limits_snapshot
   * @throws Error if evaluation fails (network error, invalid policy, etc.)
   *
   * **Requirements**:
   * - MUST return a valid ControlStep with result: "allow" | "deny" | "review"
   * - SHOULD populate reason if result is "deny" or "review"
   * - MAY populate limits_snapshot with engine-specific state
   * - MAY populate evidence_ref with URL to detailed evidence
   * - MUST NOT throw on normal deny decisions (only throw on errors)
   */
  evaluate(context: ControlEvaluationContext): Promise<ControlStep>;
}

/**
 * Control Engine Registry
 *
 * Optional helper for managing multiple control engines.
 *
 * **Usage**:
 * ```typescript
 * const registry = new ControlEngineRegistry();
 * registry.register(new SpendControlEngine());
 * registry.register(new RiskEngine());
 *
 * const engine = registry.get("spend-control-service");
 * const step = await engine.evaluate(context);
 * ```
 */
export class ControlEngineRegistry {
  private engines = new Map<string, ControlEngineAdapter>();

  /**
   * Register a control engine
   *
   * @param engine - Control engine adapter
   * @throws Error if engine with same ID already registered
   */
  register(engine: ControlEngineAdapter): void {
    if (this.engines.has(engine.engineId)) {
      throw new Error(`Control engine already registered: ${engine.engineId}`);
    }
    this.engines.set(engine.engineId, engine);
  }

  /**
   * Get control engine by ID
   *
   * @param engineId - Engine identifier
   * @returns Control engine adapter
   * @throws Error if engine not found
   */
  get(engineId: string): ControlEngineAdapter {
    const engine = this.engines.get(engineId);
    if (!engine) {
      throw new Error(`Control engine not found: ${engineId}`);
    }
    return engine;
  }

  /**
   * Check if engine is registered
   *
   * @param engineId - Engine identifier
   * @returns True if engine is registered
   */
  has(engineId: string): boolean {
    return this.engines.has(engineId);
  }

  /**
   * Get all registered engine IDs
   *
   * @returns Array of engine IDs
   */
  list(): string[] {
    return Array.from(this.engines.keys());
  }
}
