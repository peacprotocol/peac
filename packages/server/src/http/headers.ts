export const PEAC_HEADERS = {
  PROTOCOL_VERSION: 'x-peac-protocol-version',
  ATTRIBUTION: 'x-peac-attribution',
  TIER: 'x-peac-tier',
  AGENT_ATTESTATION: 'x-peac-agent-attestation',
} as const;

export const RATE_LIMIT_HEADERS = {
  LIMIT: 'ratelimit-limit',
  REMAINING: 'ratelimit-remaining',
  RESET: 'ratelimit-reset',
  POLICY: 'ratelimit-policy',
} as const;

export const STANDARD_HEADERS = {
  LINK: 'link',
  CACHE_CONTROL: 'cache-control',
} as const;

export function readAttribution(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const canonical = headers[PEAC_HEADERS.ATTRIBUTION];
  const alias = headers['peac-attribution'];

  if (Array.isArray(canonical)) {
    return canonical[0] || null;
  }
  if (canonical) {
    return canonical;
  }

  if (Array.isArray(alias)) {
    return alias[0] || null;
  }
  if (alias) {
    return alias;
  }

  return null;
}

export function detectWebBotAuthHint(headers: Record<string, string | string[] | undefined>): {
  hasSignature: boolean;
  signatureAgent?: string;
} {
  const signature = headers.signature;
  const signatureInput = headers['signature-input'];
  const signatureAgent = headers['signature-agent'];

  const hasSignature = !!(signature && signatureInput);

  return {
    hasSignature,
    signatureAgent: Array.isArray(signatureAgent) ? signatureAgent[0] : signatureAgent,
  };
}
