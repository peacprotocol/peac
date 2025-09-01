import { Policy, IdentityHint } from '../types.js';

export interface Adapter {
  readonly kind: 'web-bot-auth' | 'mcp' | 'a2a' | 'nanda';
  
  prepareIdentity(policy: Policy, context: any): Promise<IdentityHint>;
  
  normalizeReceipt?(claims: any): any;
  
  validatePolicy?(policy: Policy): void;
}

export interface WebBotAuthContext {
  signatureAgentURL: string;
  privateKey: CryptoKey | Uint8Array;
  method: string;
  authority: string;
}

export interface MCPContext {
  session: string;
  capabilities?: string[];
}

export interface A2AContext {
  proof: Uint8Array;
  agentId: string;
}

export interface NandaContext {
  ticket: string;
  scope?: string[];
}