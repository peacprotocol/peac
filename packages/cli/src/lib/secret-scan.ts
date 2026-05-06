/**
 * Secret-scan regex set for bounded-capture samples.
 *
 * Secret-scan is ON by default. When raw sample emission is possible
 * (`--capture-mode raw && --unsafe-allow-raw-capture`), the wrapper
 * runs this regex set against each candidate sample BEFORE emission.
 * If a token-like pattern matches, the sample is suppressed and
 * replaced with `{ sample_suppressed_reason: "secret_pattern_detected",
 * matched_pattern_category: <category> }`. The literal match is NEVER
 * recorded.
 *
 * The regex set is intentionally small (5 named patterns). False
 * positives are tolerated; the suppression itself is observable so a
 * verifier can detect over-suppression.
 *
 * Disabling secret-scan under raw capture requires the third unsafe
 * flag (`--unsafe-disable-secret-scan`); enforcement lives in the
 * subcommand flag-parse layer, not here.
 */

export type SecretCategory =
  | 'bearer-token'
  | 'api-key'
  | 'jwt'
  | 'aws-access-key'
  | 'generic-high-entropy';

interface SecretPattern {
  category: SecretCategory;
  pattern: RegExp;
}

/**
 * Patterns are deliberately broad. Each pattern targets the SHAPE of
 * a credential rather than a specific issuer; the goal is suppression
 * not classification accuracy.
 */
const SECRET_PATTERNS: ReadonlyArray<SecretPattern> = [
  // JWS / JWT (three base64url segments separated by dots; first segment
  // starts with a base64-encoded `{"`).
  {
    category: 'jwt',
    pattern: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
  // Bearer token in HTTP-auth shape.
  {
    category: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/i,
  },
  // AWS access key (AKIA / ASIA prefix + 16 uppercase alnum).
  {
    category: 'aws-access-key',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  // Generic API-key shape (sk_ / pk_ / api[-_]?key= prefix + >=20 alnum).
  {
    category: 'api-key',
    pattern: /\b(?:sk|pk|sk-live|sk-test|pk-live|pk-test)[_-][A-Za-z0-9]{20,}/,
  },
  // High-entropy token (>=32 contiguous base64url-ish chars). Conservative
  // length to reduce false positives on random hex IDs.
  {
    category: 'generic-high-entropy',
    pattern: /[A-Za-z0-9_-]{32,}/,
  },
];

export interface SecretMatch {
  category: SecretCategory;
}

/**
 * Scan a buffer or string for token-like patterns. Returns the first
 * match (by pattern declaration order); the literal match is NEVER
 * returned to callers.
 */
export function scanForSecrets(input: string | Uint8Array): SecretMatch | null {
  const text = typeof input === 'string' ? input : Buffer.from(input).toString('utf8');
  for (const { category, pattern } of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      return { category };
    }
  }
  return null;
}

/**
 * Scan an argv element. Same shape as `scanForSecrets` but documents
 * intent: argv elements are scanned independently of stream samples.
 */
export function scanArgvElement(token: string): SecretMatch | null {
  return scanForSecrets(token);
}
