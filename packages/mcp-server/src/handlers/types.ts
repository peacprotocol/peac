/**
 * Handler types -- DD-51: ZERO MCP SDK imports
 *
 * Pure handler interface that is transport-agnostic.
 * MCP SDK types are only used in server.ts.
 */

import type { PolicyConfig } from '../infra/policy.js';
import type { LoadedKey } from '../infra/key-loader.js';
import type { JwksKeyEntry } from '../infra/jwks-loader.js';

export interface ServerContext {
  version: string;
  policyHash: string;
  protocolVersion: string;
  issuerKey?: LoadedKey;
  jwksKeys?: JwksKeyEntry[];
  issuerId?: string;
  bundleDir?: string;
}

export interface HandlerParams<T = Record<string, unknown>> {
  input: T;
  signal?: AbortSignal;
  policy: PolicyConfig;
  context: ServerContext;
}

export interface HandlerResult {
  text: string;
  structured: Record<string, unknown>;
  isError?: boolean;
}

export type ToolHandler<T = Record<string, unknown>> = (
  params: HandlerParams<T>
) => Promise<HandlerResult>;
