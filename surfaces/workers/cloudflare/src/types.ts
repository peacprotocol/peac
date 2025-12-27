/**
 * @peac/worker-cloudflare - Cloudflare-specific types
 *
 * Runtime-specific type definitions for Cloudflare Workers.
 * Imports shared types from core and extends with CF bindings.
 *
 * @packageDocumentation
 */

// Re-export shared types
export type {
  WorkerConfig,
  ReplayContext,
  ReplayStore,
  VerificationResult,
  ProblemDetails,
} from '../../_shared/core/index.js';

/**
 * Cloudflare Worker environment bindings.
 *
 * Configure these in wrangler.toml:
 *
 * ```toml
 * [vars]
 * ISSUER_ALLOWLIST = "https://issuer1.example.com,https://issuer2.example.com"
 * BYPASS_PATHS = "/health,/ready,/metrics"
 *
 * [[durable_objects.bindings]]
 * name = "REPLAY_DO"
 * class_name = "ReplayDurableObject"
 *
 * [[d1_databases]]
 * binding = "REPLAY_D1"
 * database_name = "peac-replay"
 * database_id = "..."
 *
 * [[kv_namespaces]]
 * binding = "REPLAY_KV"
 * id = "..."
 * ```
 */
export interface Env {
  // Required configuration
  ISSUER_ALLOWLIST?: string;
  BYPASS_PATHS?: string;

  // UNSAFE overrides (development only)
  UNSAFE_ALLOW_ANY_ISSUER?: string;
  UNSAFE_ALLOW_UNKNOWN_TAGS?: string;
  UNSAFE_ALLOW_NO_REPLAY?: string;

  // Replay protection bindings (optional, priority: DO > D1 > KV)
  REPLAY_DO?: DurableObjectNamespace;
  REPLAY_D1?: D1Database;
  REPLAY_KV?: KVNamespace;
}
