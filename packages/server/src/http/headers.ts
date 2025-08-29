export const PEAC_HEADERS = {
  TIER: 'peac-tier',
  ATTRIBUTION: 'peac-attribution',
  RECEIPT: 'peac-receipt',
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

export const WEB_BOT_AUTH_HEADERS = {
  SIGNATURE: 'signature',
  SIGNATURE_INPUT: 'signature-input',
  SIGNATURE_AGENT: 'signature-agent',
} as const;

export function readAttribution(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const attribution = headers[PEAC_HEADERS.ATTRIBUTION];
  
  if (Array.isArray(attribution)) {
    return attribution[0] || null;
  }
  if (attribution) {
    return attribution;
  }
  
  return null;
}

export function parseStructuredField(value: string): string | null {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
