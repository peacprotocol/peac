/**
 * PEAC Kernel Types
 * Shared type definitions for kernel exports
 */

/**
 * Error code definition
 */
export interface ErrorDefinition {
  code: string;
  http_status: number;
  title: string;
  description: string;
  retriable: boolean;
  category: 'verification' | 'validation' | 'infrastructure' | 'control';
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
