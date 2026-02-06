/**
 * Receipt Decoding
 *
 * Decode JWS receipt for preview (header + payload) without verification.
 * This is for UI display only -- always verify before trusting claims.
 */

import { decode } from '@peac/crypto';

export interface DecodedReceipt {
  header: {
    typ?: string;
    alg?: string;
    kid?: string;
  };
  payload: Record<string, unknown>;
  raw: string;
  parts: number;
}

export function decodeReceipt(jws: string): DecodedReceipt | null {
  const trimmed = jws.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('.');
  if (parts.length !== 3) return null;

  try {
    const decoded = decode<Record<string, unknown>>(trimmed);
    return {
      header: decoded.header as DecodedReceipt['header'],
      payload: decoded.payload,
      raw: trimmed,
      parts: parts.length,
    };
  } catch {
    return null;
  }
}
