/**
 * Base64url encoding/decoding (RFC 4648 §5)
 * Used for JWS compact serialization
 */

/**
 * Encode bytes to base64url string (no padding)
 */
export function base64urlEncode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64");
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Decode base64url string to bytes
 */
export function base64urlDecode(str: string): Uint8Array {
  // Add padding if needed
  let padded = str;
  const mod = str.length % 4;
  if (mod > 0) {
    padded += "=".repeat(4 - mod);
  }

  // Convert base64url to base64
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");

  return new Uint8Array(Buffer.from(base64, "base64"));
}

/**
 * Encode UTF-8 string to base64url
 */
export function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

/**
 * Decode base64url to UTF-8 string
 */
export function base64urlDecodeString(str: string): string {
  return new TextDecoder().decode(base64urlDecode(str));
}
