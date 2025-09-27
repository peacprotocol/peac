import { Receipt } from './types.js';

export interface ReceiptBuilderOptions {
  protocol_version: string;
  wire_version: string;
  subject: {
    uri: string;
    hash?: string;
  };
  agent?: {
    ua?: string;
    attestation?: object;
  };
  aipref: {
    status: 'ok' | 'not_found' | 'error' | 'not_applicable';
    snapshot?: string;
    digest?: string;
  };
  enforcement: {
    method: 'none' | 'http-402';
    provider?: 'cdn' | 'origin' | 'gateway';
  };
  payment?: {
    rail: string;
    amount: number;
    currency: string;
    evidence: {
      provider_ids: string[];
      proof?: string;
    };
  };
  provenance?: {
    c2pa?: string;
  };
  consent?: {
    basis?: string;
  };
  verification?: {
    crawler_result?: any;
    trust_score?: number;
    risk_factors?: string[];
  };
  security?: {
    replay_token?: string;
    key_rotation_epoch?: number;
    audit_trail?: any[];
  };
  request_context: {
    request_id: string;
    session_id?: string;
    correlation_id?: string;
    timestamp: string;
  };
  crawler_type: 'bot' | 'agent' | 'hybrid' | 'browser' | 'migrating' | 'test' | 'unknown';
  kid: string;
}

/**
 * Receipt builder class for creating valid receipts
 */
export class ReceiptBuilder {
  private options: Partial<ReceiptBuilderOptions> = {};

  /**
   * Set subject information
   */
  subject(uri: string, hash?: string): this {
    this.options.subject = { uri, hash };
    return this;
  }

  /**
   * Set protocol versions
   */
  versions(protocol_version: string, wire_version: string): this {
    this.options.protocol_version = protocol_version;
    this.options.wire_version = wire_version;
    return this;
  }

  /**
   * Set AIPREF information
   */
  aipref(
    status: 'ok' | 'not_found' | 'error' | 'not_applicable',
    snapshot?: string,
    digest?: string
  ): this {
    this.options.aipref = { status, snapshot, digest };
    return this;
  }

  /**
   * Set enforcement method
   */
  enforcement(method: 'none' | 'http-402', provider?: 'cdn' | 'origin' | 'gateway'): this {
    this.options.enforcement = { method, provider };
    return this;
  }

  /**
   * Set payment information (required for http-402)
   */
  payment(
    rail: string,
    amount: number,
    currency: string,
    evidence: { provider_ids: string[]; proof?: string }
  ): this {
    this.options.payment = { rail, amount, currency, evidence };
    return this;
  }

  /**
   * Set request context
   */
  requestContext(
    request_id: string,
    timestamp: string,
    session_id?: string,
    correlation_id?: string
  ): this {
    this.options.request_context = { request_id, timestamp, session_id, correlation_id };
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
   * Build the receipt
   */
  build(): Receipt {
    if (!this.options.protocol_version) {
      throw new Error('protocol_version is required');
    }
    if (!this.options.wire_version) {
      throw new Error('wire_version is required');
    }
    if (!this.options.subject) {
      throw new Error('subject is required');
    }
    if (!this.options.aipref) {
      throw new Error('aipref is required');
    }
    if (!this.options.enforcement) {
      throw new Error('enforcement is required');
    }
    if (!this.options.request_context) {
      throw new Error('request_context is required');
    }
    if (!this.options.crawler_type) {
      throw new Error('crawler_type is required');
    }
    if (!this.options.kid) {
      throw new Error('kid is required');
    }

    const receipt: Receipt = {
      protocol_version: this.options.protocol_version,
      wire_version: this.options.wire_version,
      subject: this.options.subject,
      agent: this.options.agent || {},
      aipref: this.options.aipref,
      enforcement: this.options.enforcement,
      request_context: this.options.request_context,
      crawler_type: this.options.crawler_type,
      issued_at: new Date().toISOString(),
      kid: this.options.kid,
      signature_media_type: 'peac.receipt/0.9',
      ...(this.options.payment && { payment: this.options.payment }),
      ...(this.options.provenance && { provenance: this.options.provenance }),
      ...(this.options.consent && { consent: this.options.consent }),
      ...(this.options.verification && { verification: this.options.verification }),
      ...(this.options.security && { security: this.options.security }),
    };

    return receipt;
  }
}
