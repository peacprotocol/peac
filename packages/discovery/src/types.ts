/**
 * @peac/discovery/types - Discovery types for .well-known/peac.txt
 */

export interface PeacDiscovery {
  preferences?: string;
  access_control?: string;
  payments?: string[];
  provenance?: string;
  receipts?: 'required' | 'optional';
  verify?: string;
  public_keys?: PublicKeyInfo[];
}

export interface PublicKeyInfo {
  kid: string;
  alg: string;
  key: string;
}

export interface ParseResult {
  valid: boolean;
  data?: PeacDiscovery;
  errors?: string[];
  lineCount?: number;
}

export interface ValidationOptions {
  maxLines?: number;
  strictAbnf?: boolean;
}
