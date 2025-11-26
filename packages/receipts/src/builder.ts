import { Receipt } from './types.js';
import { WIRE_VERSION } from '@peac/kernel';

export interface ReceiptBuilderOptions {
  version: string;
  protocol_version: string;
  wire_version: string;
  subject: {
    uri: string;
  };
  sub?: string;
  aipref: {
    status: 'allowed' | 'denied' | 'restricted' | 'unknown';
  };
  purpose: 'train-ai' | 'inference' | 'content-creation' | 'analysis' | 'other';
  enforcement: {
    method: 'none' | 'http-402';
  };
  payment?: {
    rail: string;
    amount: number;
    currency: string;
  };
  crawler_type: 'bot' | 'agent' | 'hybrid' | 'browser' | 'migrating' | 'test' | 'unknown';
  kid: string;
  policy_hash?: string;
  nonce?: string;
}

/**
 * Receipt builder class for creating valid receipts
 */
export class ReceiptBuilder {
  private options: Partial<ReceiptBuilderOptions> = {};

  /**
   * Set subject information
   */
  subject(uri: string): this {
    this.options.subject = { uri };
    return this;
  }

  /**
   * Set protocol versions
   */
  versions(version: string, protocol_version: string, wire_version: string): this {
    this.options.version = version;
    this.options.protocol_version = protocol_version;
    this.options.wire_version = wire_version;
    return this;
  }

  /**
   * Set AIPREF information
   */
  aipref(status: 'allowed' | 'denied' | 'restricted' | 'unknown'): this {
    this.options.aipref = { status };
    return this;
  }

  /**
   * Set purpose
   */
  purpose(purpose: 'train-ai' | 'inference' | 'content-creation' | 'analysis' | 'other'): this {
    this.options.purpose = purpose;
    return this;
  }

  /**
   * Set enforcement method
   */
  enforcement(method: 'none' | 'http-402'): this {
    this.options.enforcement = { method };
    return this;
  }

  /**
   * Set payment information (required for http-402)
   */
  payment(rail: string, amount: number, currency: string): this {
    this.options.payment = { rail, amount, currency };
    return this;
  }

  /**
   * Set crawler type
   */
  crawlerType(
    type: 'bot' | 'agent' | 'hybrid' | 'browser' | 'migrating' | 'test' | 'unknown'
  ): this {
    this.options.crawler_type = type;
    return this;
  }

  /**
   * Set signing key ID
   */
  keyId(kid: string): this {
    this.options.kid = kid;
    return this;
  }

  /**
   * Set policy hash
   */
  policyHash(hash: string): this {
    this.options.policy_hash = hash;
    return this;
  }

  /**
   * Set nonce
   */
  nonce(nonce: string): this {
    this.options.nonce = nonce;
    return this;
  }

  /**
   * Build the receipt
   */
  build(): Receipt {
    const version = this.options.version ?? '0.9.14';
    const wire = this.options.wire_version ?? WIRE_VERSION;
    if (!this.options.protocol_version) {
      throw new Error('protocol_version is required');
    }
    if (!wire) {
      throw new Error('wire_version is required');
    }
    if (!this.options.subject) {
      throw new Error('subject is required');
    }
    if (!this.options.aipref) {
      throw new Error('aipref is required');
    }
    if (!this.options.purpose) {
      throw new Error('purpose is required');
    }
    if (!this.options.enforcement) {
      throw new Error('enforcement is required');
    }
    if (!this.options.crawler_type) {
      throw new Error('crawler_type is required');
    }
    if (!this.options.kid) {
      throw new Error('kid is required');
    }

    const receipt: Receipt = {
      version,
      protocol_version: this.options.protocol_version,
      wire_version: wire,
      subject: this.options.subject,
      aipref: this.options.aipref,
      purpose: this.options.purpose,
      enforcement: this.options.enforcement,
      crawler_type: this.options.crawler_type,
      iat: Math.floor(Date.now() / 1000),
      kid: this.options.kid,
      ...(this.options.sub && { sub: this.options.sub }),
      ...(this.options.payment && { payment: this.options.payment }),
      ...(this.options.policy_hash && { policy_hash: this.options.policy_hash }),
      ...(this.options.nonce && { nonce: this.options.nonce }),
    };

    return receipt;
  }
}
