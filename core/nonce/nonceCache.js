// core/nonce/nonceCache.js
/**
 * PEAC Protocol v0.9.1 - Nonce Protection
 * Apache 2.0 License
 */

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

class NonceCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Checks and stores a nonce. Returns true if fresh, false if replay.
   * @param {string} agentId - AI agent or user unique ID
   * @param {string} nonce
   * @param {number} timestamp - ms since epoch
   * @returns {boolean}
   */
  checkAndStore(agentId, nonce, timestamp) {
    const now = Date.now();
    if (Math.abs(now - timestamp) > NONCE_TTL_MS) return false; // stale

    const key = `${agentId}:${nonce}`;
    if (this.cache.has(key)) return false; // replayed

    this.cache.set(key, now);

    // Cleanup old entries
    for (const [k, v] of this.cache) {
      if (now - v > NONCE_TTL_MS) this.cache.delete(k);
    }
    return true;
  }
}

module.exports = { NonceCache, NONCE_TTL_MS };
