/**
 * PEAC Kernel Types
 * Shared type definitions for kernel exports
 */

// -----------------------------------------------------------------------------
// JSON-Safe Types (v0.9.21+)
// -----------------------------------------------------------------------------

/**
 * JSON-safe primitive value
 *
 * Represents values that can be directly serialized to JSON.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON-safe value (recursive)
 *
 * Use for any data that must be JSON-serializable.
 * Excludes undefined, functions, symbols, BigInt, Date, etc.
 */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * JSON-safe array
 */
export type JsonArray = JsonValue[];

/**
 * JSON-safe object
 *
 * Use for opaque/extensible evidence fields instead of `unknown`.
 * Provides JSON-serializability guarantee without requiring full type knowledge.
 *
 * @example
 * // Before (type hole)
 * evidence: unknown;
 *
 * // After (JSON-safe guarantee)
 * evidence: JsonObject;
 */
export type JsonObject = { [key: string]: JsonValue };

// -----------------------------------------------------------------------------
// Registry Types
// -----------------------------------------------------------------------------

/**
 * Error code definition
 */
export interface ErrorDefinition {
  code: string;
  http_status: number;
  title: string;
  description: string;
  retriable: boolean;
  category:
    | 'verification'
    | 'validation'
    | 'infrastructure'
    | 'control'
    | 'identity'
    | 'attribution'
    | 'dispute'
    | 'bundle'
    | 'ucp'
    | 'workflow';
}

/**
 * Payment rail registry entry
 */
export interface PaymentRailEntry {
  id: string;
  category: string;
  description: string;
  reference: string | null;
  status: string;
}

/**
 * Control engine registry entry
 */
export interface ControlEngineEntry {
  id: string;
  category: string;
  description: string;
  reference: string | null;
  status: string;
}

/**
 * Transport method registry entry
 */
export interface TransportMethodEntry {
  id: string;
  category: string;
  description: string;
  reference: string | null;
  status: string;
}

/**
 * Agent protocol registry entry
 */
export interface AgentProtocolEntry {
  id: string;
  category: string;
  description: string;
  reference: string | null;
  status: string;
}
