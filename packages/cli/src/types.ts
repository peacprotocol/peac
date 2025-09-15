/**
 * Types for PEAC CLI
 */

export interface CLIOptions {
  verbose?: boolean;
  json?: boolean;
  timeout?: number;
}

export interface CommandResult {
  success: boolean;
  data?: any;
  error?: string;
  timing?: {
    started: number;
    completed: number;
    duration: number;
  };
}

export interface DiscoverResult {
  url: string;
  sources: Array<{
    type: 'aipref' | 'agent-permissions' | 'peac.txt';
    url: string;
    status: 'found' | 'not_found' | 'error';
    etag?: string;
    content?: any;
  }>;
}

export interface HashResult {
  algorithm: 'SHA-256';
  format: 'JCS';
  digest: string;
  input_size: number;
}

export interface VerifyResult {
  valid: boolean;
  receipt?: {
    header: any;
    payload: any;
  };
  policy_hash?: string;
  resource?: string;
  error?: string;
}
