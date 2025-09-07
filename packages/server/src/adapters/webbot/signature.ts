import * as crypto from 'crypto';
import { Request } from 'express';
import { isValidEd25519JWK } from './jwk';

export interface SignatureComponents {
  tag: string;
  keyid?: string;
  created?: number;
  expires?: number;
  components: string[];
}

export function parseSignatureInput(header: string): SignatureComponents[] {
  const results: SignatureComponents[] = [];

  // Split on commas, handling quoted values
  const parts = header.match(/[^,]+/g) || [];

  for (const part of parts) {
    const trimmed = part.trim();
    const match = trimmed.match(/(\w+)=\((.*?)\);(.+)/);
    if (!match) continue;

    const [, tag, components, params] = match;
    const result: SignatureComponents = {
      tag,
      components: components.split(/\s+/).map((c) => c.replace(/"/g, '')),
    };

    // Parse parameters
    const keyidMatch = params.match(/keyid="([^"]+)"/);
    if (keyidMatch) result.keyid = keyidMatch[1];

    const createdMatch = params.match(/created=(\d+)/);
    if (createdMatch) result.created = parseInt(createdMatch[1]);

    const expiresMatch = params.match(/expires=(\d+)/);
    if (expiresMatch) result.expires = parseInt(expiresMatch[1]);

    results.push(result);
  }

  return results;
}

export function buildSignatureBase(components: string[], req: Request): string {
  const lines: string[] = [];

  for (const comp of components) {
    if (comp.startsWith('@')) {
      // Derived components
      switch (comp) {
        case '@method': {
          lines.push(`"@method": ${req.method}`);
          break;
        }
        case '@target-uri': {
          const protocol = req.secure ? 'https' : 'http';
          const host = req.get('host') || 'localhost';
          lines.push(`"@target-uri": ${protocol}://${host}${req.url}`);
          break;
        }
        case '@authority':
          lines.push(`"@authority": ${req.get('host') || 'localhost'}`);
          break;
        case '@scheme':
          lines.push(`"@scheme": ${req.secure ? 'https' : 'http'}`);
          break;
        case '@request-target':
          lines.push(`"@request-target": ${req.url}`);
          break;
        case '@path':
          lines.push(`"@path": ${req.path}`);
          break;
        case '@query': {
          const query = new URL(req.url, 'http://localhost').search;
          lines.push(`"@query": ${query || '?'}`);
          break;
        }
      }
    } else {
      // Regular header
      const value = req.get(comp);
      if (value !== undefined) {
        lines.push(`"${comp.toLowerCase()}": ${value}`);
      }
    }
  }

  // Add signature parameters
  const sigParams = components.map((c) => `"${c}"`).join(' ');
  lines.push(`"@signature-params": ${sigParams}`);

  return lines.join('\n');
}

export async function verifySignature(
  signatureHeader: string,
  signatureInputHeader: string,
  req: Request,
  key: Record<string, unknown>,
  now: number,
  skewSec: number = 120
): Promise<{ ok: boolean; keyid?: string; reason?: string }> {
  try {
    if (!isValidEd25519JWK(key)) {
      return { ok: false, reason: 'invalid_key' };
    }

    // Parse signature input
    const inputs = parseSignatureInput(signatureInputHeader);
    const signature = inputs.find((i) => i.keyid);

    if (!signature || !signature.keyid) {
      return { ok: false, reason: 'no_keyid' };
    }

    // Check timing
    const nowSec = Math.floor(now / 1000);
    if (signature.created && signature.created > nowSec + skewSec) {
      return { ok: false, reason: 'future' };
    }
    if (signature.expires && signature.expires < nowSec - skewSec) {
      return { ok: false, reason: 'stale' };
    }

    // Verify required components
    const required = ['signature-agent', '@authority'];
    for (const comp of required) {
      if (!signature.components.includes(comp)) {
        return { ok: false, reason: 'component_missing' };
      }
    }

    // Build signature base
    const base = buildSignatureBase(signature.components, req);

    // Extract signature value
    const sigMatch = signatureHeader.match(/:([A-Za-z0-9+/=]+):/);
    if (!sigMatch) {
      return { ok: false, reason: 'bad_signature_format' };
    }

    const signatureBytes = Buffer.from(sigMatch[1], 'base64');

    // Import Ed25519 public key
    const publicKey = crypto.createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: key.x,
      },
      format: 'jwk',
    });

    // Verify signature
    const valid = crypto.verify(null, Buffer.from(base, 'utf-8'), publicKey, signatureBytes);

    return valid
      ? { ok: true, keyid: signature.keyid }
      : { ok: false, reason: 'signature_invalid' };
  } catch (error) {
    return { ok: false, reason: 'verification_error' };
  }
}
