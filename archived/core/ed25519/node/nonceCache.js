/**
 * PEAC Protocol v0.9.1
 * Nonce cache for anti-replay (memory-only, not persistent)
 * Apache 2.0 License
 */

const NONCE_TTL = 5 * 60 * 1000; // 5 minutes in ms

class NonceCache {
  constructor() {
    this.nonces = new Map();
  }

  // Returns true if nonce is new and valid; false if replayed or expired
  add(nonce, timestamp) {
    const now = Date.now();
    if (this.nonces.has(nonce)) return false;
    if (Math.abs(now - Number(timestamp)) > NONCE_TTL) return false;
    this.nonces.set(nonce, now);
    // Schedule cleanup
    setTimeout(() => this.nonces.delete(nonce), NONCE_TTL);
    return true;
  }

  // For tests/debug
  clear() {
    this.nonces.clear();
  }
}

module.exports = NonceCache;
