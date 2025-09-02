import { request } from 'undici';
import * as ed25519 from '@noble/ed25519';
import { ReceiptResult, KeyStore, KeyResolver, JsonWebKey } from './types.js';

export interface CaptureReceiptOptions {
  siteKeys?: KeyStore | KeyResolver;
  timeout?: number;
}

const DEFAULT_OPTIONS = {
  timeout: 5000,
};

export async function captureReceipt(
  response: Response,
  options: CaptureReceiptOptions = {},
): Promise<ReceiptResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Check for direct receipt in header
    const receiptHeader = response.headers.get('peac-receipt');
    if (receiptHeader) {
      const jws = decodeReceiptFromHeader(receiptHeader);
      if (!jws) {
        return { ok: false, error: 'invalid_receipt_encoding' };
      }

      // Verify if keys provided
      if (options.siteKeys) {
        const verifyResult = await verifyReceipt(jws, options.siteKeys);
        return verifyResult;
      }

      return { ok: true, jws };
    }

    // Check for hosted receipt reference
    const receiptRefHeader = response.headers.get('peac-receipt-ref');
    if (receiptRefHeader) {
      const refUrl = receiptRefHeader.replace(/^"|"$/g, ''); // Remove quotes

      try {
        const receiptResponse = await request(refUrl, {
          method: 'GET',
          headers: {
            accept: 'application/jose',
            'user-agent': 'peac-sdk-node/0.9.11',
          },
          throwOnError: true,
          bodyTimeout: opts.timeout,
          headersTimeout: opts.timeout,
          maxRedirections: 0, // No redirects for receipt refs
        });

        if (receiptResponse.statusCode !== 200) {
          return { ok: false, error: 'receipt_fetch_failed', ref: refUrl };
        }

        const contentType = receiptResponse.headers['content-type'] as string;
        if (!contentType?.includes('application/jose')) {
          return { ok: false, error: 'invalid_receipt_content_type', ref: refUrl };
        }

        // Read JWS body
        const chunks: Buffer[] = [];
        for await (const chunk of receiptResponse.body) {
          chunks.push(chunk);
        }
        const jws = Buffer.concat(chunks).toString('utf8').trim();

        // Verify if keys provided
        if (options.siteKeys) {
          const verifyResult = await verifyReceipt(jws, options.siteKeys);
          return { ...verifyResult, ref: refUrl };
        }

        return { ok: true, jws, ref: refUrl };
      } catch (error) {
        return {
          ok: false,
          error: 'receipt_fetch_error',
          ref: refUrl,
        };
      }
    }

    // No receipt found
    return { ok: false, error: 'no_receipt' };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    };
  }
}

export async function verifyReceipt(
  jws: string,
  keys: KeyStore | KeyResolver,
): Promise<ReceiptResult> {
  try {
    // Parse JWS header to get kid and alg
    const parts = jws.split('.');
    if (parts.length !== 3) {
      return { ok: false, error: 'invalid_jws_format' };
    }

    const headerB64 = parts[0];
    if (!headerB64) {
      return { ok: false, error: 'missing_jws_header' };
    }

    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));

    if (header.alg !== 'EdDSA') {
      return { ok: false, error: 'unsupported_algorithm' };
    }

    if (!header.kid) {
      return { ok: false, error: 'missing_kid' };
    }

    if (header.typ && header.typ !== 'application/peac-receipt') {
      return { ok: false, error: 'invalid_type' };
    }

    // Get the verification key
    let jwk: JsonWebKey | undefined;
    if (typeof keys === 'function') {
      jwk = await keys(header.kid);
    } else {
      jwk = keys[header.kid];
    }

    if (!jwk) {
      return { ok: false, error: 'key_not_found' };
    }

    if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519') {
      return { ok: false, error: 'invalid_key_type' };
    }

    if (!jwk.x) {
      return { ok: false, error: 'missing_public_key' };
    }

    // Convert JWK to raw public key
    const publicKeyBytes = Buffer.from(jwk.x, 'base64url');

    // Prepare signature data (header.payload)
    const signatureData = headerB64 + '.' + parts[1];
    const dataBytes = Buffer.from(signatureData, 'utf8');

    // Extract signature
    const signatureBytes = Buffer.from(parts[2] || '', 'base64url');

    // Verify Ed25519 signature
    const isValid = await ed25519.verify(signatureBytes, dataBytes, publicKeyBytes);

    if (!isValid) {
      return { ok: false, error: 'signature_invalid' };
    }

    // Parse and validate claims
    const payload = JSON.parse(Buffer.from(parts[1] || '', 'base64url').toString('utf8'));

    // Basic claim validation
    const now = Math.floor(Date.now() / 1000);

    if (payload.iat && payload.iat > now + 60) {
      return { ok: false, error: 'issued_in_future' };
    }

    // Check expiry (receipts valid for 30 days)
    if (payload.iat && payload.iat < now - 30 * 24 * 3600) {
      return { ok: false, error: 'expired' };
    }

    return { ok: true, jws, claims: payload };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'verification_error',
    };
  }
}

function decodeReceiptFromHeader(headerValue: string): string | null {
  // Handle Structured Fields sf-binary format :base64url:
  if (headerValue.startsWith(':') && headerValue.endsWith(':')) {
    const base64url = headerValue.slice(1, -1);
    try {
      return Buffer.from(base64url, 'base64url').toString('utf8');
    } catch {
      return null;
    }
  }

  // Fallback: assume it's already a JWS
  return headerValue;
}

export function encodeReceiptForHeader(jws: string): string {
  // Encode as Structured Fields sf-binary
  const base64url = Buffer.from(jws, 'utf8').toString('base64url');
  return `:${base64url}:`;
}
