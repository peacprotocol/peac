/**
 * @peac/safe-fetch
 * SSRF-safe fetch wrapper with CIDR blocking, DNS validation, and timeout controls
 */

const BLOCKED_SCHEMES = new Set(['file:', 'data:', 'ftp:', 'gopher:', 'javascript:']);

const PRIVATE_IPV4_RANGES = [
  { start: '127.0.0.0', end: '127.255.255.255' }, // Loopback
  { start: '10.0.0.0', end: '10.255.255.255' }, // RFC1918
  { start: '172.16.0.0', end: '172.31.255.255' }, // RFC1918
  { start: '192.168.0.0', end: '192.168.255.255' }, // RFC1918
  { start: '169.254.0.0', end: '169.254.255.255' }, // Link-local
  { start: '0.0.0.0', end: '0.255.255.255' }, // Current network
];

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '::',
]);

export interface SafeFetchOptions extends RequestInit {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBodySize?: number;
  userAgent?: string;
}

export class SSRFError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'SSRFError';
  }
}

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPrivateIPv4(ip: string): boolean {
  const num = ipv4ToNumber(ip);
  for (const range of PRIVATE_IPV4_RANGES) {
    const start = ipv4ToNumber(range.start);
    const end = ipv4ToNumber(range.end);
    if (num >= start && num <= end) {
      return true;
    }
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true;
  }
  return false;
}

export function isBlockedUrl(url: string | URL): { blocked: boolean; reason?: string } {
  try {
    const u = typeof url === 'string' ? new URL(url) : url;

    if (BLOCKED_SCHEMES.has(u.protocol)) {
      return { blocked: true, reason: `blocked:scheme:${u.protocol}` };
    }

    const hostname = u.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(hostname)) {
      return { blocked: true, reason: `blocked:hostname:${hostname}` };
    }

    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      if (isPrivateIPv4(hostname)) {
        return { blocked: true, reason: `blocked:private-ipv4:${hostname}` };
      }
    }

    if (hostname.includes(':')) {
      if (isPrivateIPv6(hostname)) {
        return { blocked: true, reason: `blocked:private-ipv6:${hostname}` };
      }
    }

    return { blocked: false };
  } catch (error) {
    return { blocked: true, reason: 'invalid-url' };
  }
}

export async function safeFetch(
  input: string | URL,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.PEAC_DISCOVERY_TIMEOUT_MS) ?? 3000;
  const maxRedirects =
    options.maxRedirects ?? Number(process.env.PEAC_DISCOVERY_MAX_REDIRECTS) ?? 3;
  const maxBodySize = options.maxBodySize ?? Number(process.env.PEAC_DISCOVERY_MAX_BYTES) ?? 262144;
  const userAgent = options.userAgent ?? process.env.PEAC_DISCOVERY_USER_AGENT ?? 'peac/0.9.15';

  let currentUrl = typeof input === 'string' ? input : input.toString();
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    const blockCheck = isBlockedUrl(currentUrl);
    if (blockCheck.blocked) {
      throw new SSRFError(`SSRF protection: ${blockCheck.reason}`, blockCheck.reason || 'blocked');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        ...options,
        headers: {
          'User-Agent': userAgent,
          ...options.headers,
        },
        signal: controller.signal,
        redirect: 'manual',
      });

      clearTimeout(timeoutId);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new SSRFError('Redirect without location header', 'invalid-redirect');
        }

        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new SSRFError(`Too many redirects (max ${maxRedirects})`, 'too-many-redirects');
        }

        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && Number(contentLength) > maxBodySize) {
        throw new SSRFError(
          `Response too large: ${contentLength} > ${maxBodySize}`,
          'response-too-large'
        );
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SSRFError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new SSRFError(`Request timeout after ${timeoutMs}ms`, 'timeout');
      }
      throw error;
    }
  }

  throw new SSRFError(`Too many redirects (max ${maxRedirects})`, 'too-many-redirects');
}

export type { SafeFetchOptions as FetchOptions };
