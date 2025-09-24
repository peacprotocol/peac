// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { canonicalize } from 'json-canonicalize';
import { signDetached } from '@peac/core/crypto';
import { uuidv7 } from '@peac/core/ids/uuidv7';
import type { PEACReceipt } from './types.js';

export const b64u = {
  encode: (buf: Uint8Array): string =>
    Buffer.from(buf).toString('base64url'),
  decode: (str: string): Uint8Array =>
    new Uint8Array(Buffer.from(str, 'base64url'))
};

export const sha256b64u = (bytes: Uint8Array): string =>
  `sha256:${b64u.encode(createHash('sha256').update(bytes).digest())}`;

export const jcsSha256 = (obj: any): string => {
  const canonical = canonicalize(obj);
  return sha256b64u(Buffer.from(canonical));
};

export const isValidUUIDv7 = (uuid: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);

export function createReceipt(params: {
  iss: string;
  resource_url: string;
  resource_hash: string;
  policy_href: string;
  policy_hash: string;
  merged_policy_hash: string;
  method?: string;
  payment?: PEACReceipt['payment'];
  purpose?: string;
  trace_id?: string;
}): PEACReceipt {
  const now = Math.floor(Date.now() / 1000);
  const resourceHash = params.resource_hash.startsWith('sha256:')
    ? params.resource_hash
    : `sha256:${params.resource_hash}`;

  return {
    typ: "peac.receipt/0.9",
    iss: params.iss,
    sub: `urn:resource:${resourceHash}`,
    aud: normalizeUrl(params.resource_url),
    iat: now,
    exp: now + 300, // 5 minutes max
    jti: uuidv7(),

    policy: {
      aipref: {
        href: params.policy_href,
        hash: params.policy_hash.startsWith('sha256:')
          ? params.policy_hash
          : `sha256:${params.policy_hash}`
      },
      merged_hash: params.merged_policy_hash.startsWith('sha256:')
        ? params.merged_policy_hash
        : `sha256:${params.merged_policy_hash}`
    },

    resource: {
      url: normalizeUrl(params.resource_url),
      method: params.method || 'GET',
      hash: resourceHash
    },

    ...(params.payment && { payment: params.payment }),
    ...(params.purpose && { purpose: params.purpose }),
    ...(params.trace_id && { trace_id: params.trace_id })
  };
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // Lowercase scheme and host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports
    if ((parsed.protocol === 'https:' && parsed.port === '443') ||
        (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }

    return parsed.toString();
  } catch {
    return url; // Return original if invalid
  }
}

export async function signReceipt(
  receipt: PEACReceipt,
  privateKey: Uint8Array,
  kid: string
): Promise<string> {
  if (!isValidUUIDv7(receipt.jti)) {
    throw new Error('Invalid UUIDv7 in jti field');
  }

  if (receipt.typ !== "peac.receipt/0.9") {
    throw new Error('Invalid receipt type');
  }

  const payload = canonicalize(receipt);
  const header = { alg: 'EdDSA', typ: 'JWT', kid };

  return signDetached(payload, privateKey, header);
}