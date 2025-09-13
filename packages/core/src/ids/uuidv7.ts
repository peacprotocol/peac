/**
 * UUIDv7 implementation per RFC 9562
 * Monotonic time-ordered UUID with millisecond precision
 */
export function uuidv7(timestamp = Date.now()): string {
  const ms = BigInt(timestamp);
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);

  // Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
  // 7 = version, y = variant (8,9,a,b)
  const hex = (n: number, w: number) => n.toString(16).padStart(w, '0');

  return [
    hex(Number(ms >> 16n) & 0xffffffff, 8),
    hex(Number(ms) & 0xffff, 4),
    '7' + hex((rand[0] & 0xfff) | 0x000, 3),
    hex((rand[1] & 0x3f) | 0x80, 2) + hex(rand[2], 2),
    Array.from(rand.slice(3, 9), (b) => hex(b, 2)).join(''),
  ].join('-');
}

/**
 * Validate UUIDv7 format
 */
export function isUUIDv7(uuid: string): boolean {
  const pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return pattern.test(uuid);
}

/**
 * Extract timestamp from UUIDv7
 */
export function extractTimestamp(uuidv7: string): number {
  if (!isUUIDv7(uuidv7)) {
    throw new Error('Invalid UUIDv7 format');
  }

  const hex = uuidv7.replace(/-/g, '');
  const timestampHex = hex.substring(0, 12);
  return parseInt(timestampHex, 16);
}
