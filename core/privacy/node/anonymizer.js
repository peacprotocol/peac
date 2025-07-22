/**
 * PEAC Protocol Privacy Anonymizer (Node)
 * Apache 2.0 License
 */
const crypto = require('crypto');

/**
 * Hashes input (user/agent ID) with SHA-256.
 * @param {string} id - The input string (e.g., agent ID)
 * @returns {string} - Hex-encoded SHA-256 hash
 */
function anonymizeId(id) {
  return crypto.createHash('sha256').update(id).digest('hex');
}

/**
 * Logs a PEAC request, respecting the do_not_log flag.
 * @param {object} req - { agentId, path, do_not_log }
 * @returns {object|null} - Logged entry or null if not logged
 */
function logRequest({ agentId, path, do_not_log }) {
  if (do_not_log) return null;
  return {
    timestamp: new Date().toISOString(),
    agent: anonymizeId(agentId),
    path,
    privacy: do_not_log ? 'private' : 'normal',
  };
}

module.exports = { anonymizeId, logRequest };
