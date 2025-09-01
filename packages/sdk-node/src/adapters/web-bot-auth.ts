import * as ed25519 from '@noble/ed25519';
import { Adapter, WebBotAuthContext } from './types.js';
import { Policy, IdentityHint, Signer } from '../types.js';

export class WebBotAuthAdapter implements Adapter {
  readonly kind = 'web-bot-auth' as const;

  async prepareIdentity(policy: Policy, context: WebBotAuthContext): Promise<IdentityHint> {
    // Validate that the policy accepts Web Bot Auth
    if (!policy.identity?.web_bot_auth?.accepted) {
      throw new Error('Policy does not accept Web Bot Auth');
    }

    // Create signer from context
    let signer: Signer;

    if (context.privateKey instanceof Uint8Array) {
      signer = new Ed25519Signer(context.privateKey);
    } else if (context.privateKey instanceof CryptoKey) {
      signer = new CryptoKeySigner(context.privateKey);
    } else {
      throw new Error('Invalid private key format');
    }

    return {
      kind: 'web-bot-auth',
      signatureAgentURL: context.signatureAgentURL,
      signer,
    };
  }

  validatePolicy(policy: Policy): void {
    if (policy.identity?.web_bot_auth && typeof policy.identity.web_bot_auth !== 'object') {
      throw new Error('Invalid web_bot_auth configuration');
    }
  }
}

class Ed25519Signer implements Signer {
  constructor(private privateKey: Uint8Array) {
    if (privateKey.length !== 32) {
      throw new Error('Ed25519 private key must be 32 bytes');
    }
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    return ed25519.sign(data, this.privateKey);
  }

  async getPublicKey(): Promise<Uint8Array> {
    return ed25519.getPublicKey(this.privateKey);
  }
}

class CryptoKeySigner implements Signer {
  constructor(private cryptoKey: CryptoKey) {
    if (cryptoKey.algorithm.name !== 'Ed25519') {
      throw new Error('CryptoKey must be Ed25519');
    }
  }

  async sign(data: Uint8Array): Promise<Uint8Array> {
    const signature = await crypto.subtle.sign('Ed25519', this.cryptoKey, data);
    return new Uint8Array(signature);
  }

  async getPublicKey(): Promise<Uint8Array> {
    // Extract public key from the CryptoKey
    const exported = await crypto.subtle.exportKey('raw', this.cryptoKey);
    return new Uint8Array(exported);
  }
}

// Built-in WBA adapter instance
export const webBotAuthAdapter = new WebBotAuthAdapter();
