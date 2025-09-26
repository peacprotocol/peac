/**
 * @peac/core v0.9.14 - Base64url utilities
 * Unpadded base64url encoding/decoding
 */

export function b64u(input: string | Uint8Array): string {
  const buffer = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function b64uDecode(input: string): Uint8Array {
  // Add padding if needed
  const padded = input + '==='.slice((input.length + 3) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function b64uDecodeString(input: string): string {
  return new TextDecoder().decode(b64uDecode(input));
}
