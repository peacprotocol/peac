import { Policy, IdentityHint } from './types.js';

export interface BuildHeadersOptions {
  attribution?: string;
  identity?: IdentityHint;
  strict?: boolean;
}

export interface ParsedHeaders {
  attribution?: string;
  agreement?: string;
  receiptKid?: string;
  signature?: string;
  signatureInput?: string;
  signatureAgent?: string;
}

export interface CreateHeadersOptions {
  attribution?: string;
  agreement?: string;
  receiptKid?: string;
  signature?: string;
  signatureInput?: string;
  signatureAgent?: string;
}

const DEFAULT_OPTIONS: Required<Omit<BuildHeadersOptions, 'attribution' | 'identity'>> = {
  strict: true,
};

export function buildRequestHeaders(policy: Policy, options: BuildHeadersOptions = {}): Headers {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const headers = new Headers();

  // Always add policy link
  headers.set('link', '</.well-known/peac>; rel="peac-policy"');

  // Handle attribution
  if (options.attribution) {
    // Validate attribution format if policy specifies one
    if (policy.attribution?.format && opts.strict) {
      const regex = new RegExp(policy.attribution.format);
      if (!regex.test(options.attribution)) {
        throw new Error(
          `Attribution "${options.attribution}" does not match required format: ${policy.attribution.format}`,
        );
      }
    }

    headers.set('peac-attribution', options.attribution);
  }

  // Handle identity hints
  if (options.identity) {
    switch (options.identity.kind) {
      case 'web-bot-auth':
        if (options.identity.signatureAgentURL && options.identity.signer) {
          // This would be implemented by the WBA adapter
          // For now, just set the signature-agent header
          headers.set('signature-agent', options.identity.signatureAgentURL);
          // Note: Actual signature generation would happen in the adapter
        }
        break;

      case 'mcp':
        if (options.identity.session) {
          headers.set('peac-mcp-session', options.identity.session);
        }
        break;

      case 'a2a':
        if (options.identity.proof) {
          const proofB64 = Buffer.from(options.identity.proof).toString('base64url');
          headers.set('peac-a2a-proof', proofB64);
        }
        break;

      case 'nanda':
        if (options.identity.ticket) {
          headers.set('peac-nanda-ticket', options.identity.ticket);
        }
        break;
    }
  }

  return headers;
}

export function validateAttributionFormat(attribution: string, format: string): boolean {
  if (!attribution || !format) {
    return false;
  }

  try {
    const regex = new RegExp(format);
    return regex.test(attribution);
  } catch {
    return false;
  }
}

/**
 * Parse PEAC headers from a request/response object
 */
export function parseHeaders(headers: Record<string, string | undefined>): ParsedHeaders {
  const result: ParsedHeaders = {};

  // Normalize header names to lowercase for case-insensitive lookup
  const normalizedHeaders = Object.entries(headers).reduce(
    (acc, [key, value]) => {
      if (value !== undefined) {
        acc[key.toLowerCase()] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  // Parse PEAC-specific headers
  if (normalizedHeaders['peac-attribution']) {
    result.attribution = normalizedHeaders['peac-attribution'];
  }
  if (normalizedHeaders['peac-agreement']) {
    result.agreement = normalizedHeaders['peac-agreement'];
  }
  if (normalizedHeaders['peac-receipt-kid']) {
    result.receiptKid = normalizedHeaders['peac-receipt-kid'];
  }
  if (normalizedHeaders['signature']) {
    result.signature = normalizedHeaders['signature'];
  }
  if (normalizedHeaders['signature-input']) {
    result.signatureInput = normalizedHeaders['signature-input'];
  }
  if (normalizedHeaders['signature-agent']) {
    result.signatureAgent = normalizedHeaders['signature-agent'];
  }

  return result;
}

/**
 * Create PEAC headers object from options
 */
export function createHeaders(options: CreateHeadersOptions): Record<string, string> {
  const headers: Record<string, string> = {};

  if (options.attribution) {
    headers['peac-attribution'] = options.attribution;
  }
  if (options.agreement) {
    headers['peac-agreement'] = options.agreement;
  }
  if (options.receiptKid) {
    headers['peac-receipt-kid'] = options.receiptKid;
  }
  if (options.signature) {
    headers['signature'] = options.signature;
  }
  if (options.signatureInput) {
    headers['signature-input'] = options.signatureInput;
  }
  if (options.signatureAgent) {
    headers['signature-agent'] = options.signatureAgent;
  }

  return headers;
}

export function buildWebBotAuthHeaders(
  signatureAgentURL: string,
  _method: string,
  _authority: string,
  _signer: (data: Uint8Array) => Promise<Uint8Array>,
): Promise<Record<string, string>> {
  // This is a placeholder - actual implementation would be in the WBA adapter
  // The adapter would:
  // 1. Create signature input covering "@authority" and "signature-agent"
  // 2. Generate signature using Ed25519
  // 3. Return headers: signature-input, signature, signature-agent

  return Promise.resolve({
    'signature-agent': signatureAgentURL,
    'signature-input': 'sig1=("@authority" "signature-agent");created=1234567890',
    signature: 'sig1=:base64url-signature:',
  });
}
