import { thumbprintEd25519, isValidEd25519JWK } from './jwk';
import type { JWK } from 'jose';
import { logger } from '../../logging';
import { getDomain } from 'tldts';
import { lookup } from 'dns/promises';
import { IPv4, IPv6, process as processIP } from 'ipaddr.js';
import {
  directoryCache,
  singleflight,
  getJitteredBackoff,
  hasThumbprintOverlap,
  type DirRecord,
} from './cache';
import * as crypto from 'crypto';

export interface DirectoryFetchOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
  ttlCapSec?: number;
  skewSec?: number;
  timeoutMs?: number;
  maxSizeBytes?: number;
  allowedPorts?: number[];
  etag?: string;
  lastModified?: string;
}

const DEFAULT_OPTIONS: Required<Omit<DirectoryFetchOptions, 'etag' | 'lastModified'>> = {
  fetchFn: fetch,
  now: () => Date.now(),
  ttlCapSec: 86400, // 24 hours max
  skewSec: 120, // 2 minutes
  timeoutMs: 2000,
  maxSizeBytes: 32768, // 32KB
  allowedPorts: [443],
};

// Directory fetch path (configurable constant)
const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory';

export async function fetchAndVerifyDir(
  origin: string,
  opts: DirectoryFetchOptions = {},
): Promise<{ record: DirRecord; notModified?: boolean }> {
  const options = { ...DEFAULT_OPTIONS, ...opts };

  // Check negative cache
  const negativeUntil = directoryCache.getNegative(origin);
  if (negativeUntil) {
    throw new Error('dir_negative_cache');
  }

  // Use singleflight to prevent stampedes
  return singleflight(`dir:${origin}`, async () => {
    const url = `${origin}${DIRECTORY_PATH}`;

    // Validate URL and resolve DNS
    await validateAndResolveUrl(url, options);

    try {
      const result = await fetchDirectoryInternal(url, options);
      return result;
    } catch (error) {
      // Set negative cache on failure
      if (
        error instanceof Error &&
        (error.message.includes('404') || error.message.includes('5'))
      ) {
        const backoffMs = getJitteredBackoff(5 * 60 * 1000, 10 * 60 * 1000);
        directoryCache.setNegative(origin, Date.now() + backoffMs);
      }
      throw error;
    }
  });
}

async function validateAndResolveUrl(url: string, options: DirectoryFetchOptions): Promise<void> {
  const parsed = new URL(url);

  // Must be HTTPS
  if (parsed.protocol !== 'https:') {
    throw new Error('bad_scheme');
  }

  // No credentials
  if (parsed.username || parsed.password) {
    throw new Error('bad_url');
  }

  // Check port
  const port = parseInt(parsed.port || '443', 10);
  if (!options.allowedPorts?.includes(port)) {
    throw new Error('bad_port');
  }

  // DNS resolution and private IP check
  const hostname = parsed.hostname;

  // Reject IP literals immediately
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || /^\[.*\]$/.test(hostname)) {
    throw new Error('ssrf_blocked');
  }

  // Resolve DNS and check for private IPs
  try {
    const addresses = await lookup(hostname, { all: true });

    for (const addr of addresses) {
      const ip = addr.address;

      // Parse and check IP
      const parsed = IPv4.isValid(ip) || IPv6.isValid(ip) ? processIP(ip) : null;
      if (!parsed) continue;

      // Block private, link-local, CGNAT, loopback
      if (
        parsed.range() === 'private' ||
        parsed.range() === 'linkLocal' ||
        parsed.range() === 'loopback' ||
        parsed.range() === 'uniqueLocal' ||
        (IPv4.isValid(ip) && ip.startsWith('100.64.'))
      ) {
        // CGNAT
        throw new Error('ssrf_blocked');
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'ssrf_blocked') {
      throw error;
    }
    // DNS resolution failure
    throw new Error('dns_failure');
  }
}

async function fetchDirectoryInternal(
  url: string,
  options: DirectoryFetchOptions,
): Promise<{ record: DirRecord; notModified?: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    // Build request headers
    const headers: Record<string, string> = {
      Accept: 'application/http-message-signatures-directory+json',
      'User-Agent': 'PEAC/0.9.10',
    };

    // Add conditional headers if available
    if (options.etag) {
      headers['If-None-Match'] = options.etag;
    }
    if (options.lastModified) {
      headers['If-Modified-Since'] = options.lastModified;
    }

    const response = await options.fetchFn!(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers,
    });

    // Handle redirects (max 1, same origin only)
    if (response.status >= 301 && response.status <= 308) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Invalid redirect');
      }

      const originalOrigin = new URL(url).origin;
      const redirectUrl = new URL(location, url);

      if (redirectUrl.origin !== originalOrigin) {
        throw new Error('Cross-origin redirect not allowed');
      }

      // Follow redirect once
      const redirectResponse = await options.fetchFn!(redirectUrl.href, {
        signal: controller.signal,
        redirect: 'manual',
        headers,
      });

      return handleDirectoryResponse(redirectResponse, redirectUrl.origin, options);
    }

    return handleDirectoryResponse(response, new URL(url).origin, options);
  } finally {
    clearTimeout(timeout);
  }
}

async function handleDirectoryResponse(
  response: Response,
  origin: string,
  options: DirectoryFetchOptions,
): Promise<{ record: DirRecord; notModified?: boolean }> {
  const now = options.now!();

  // Handle 304 Not Modified
  if (response.status === 304) {
    const cached = directoryCache.get(origin);
    if (cached) {
      // Refresh timers
      cached.verifiedAt = now;
      cached.expiresAt = now + options.ttlCapSec! * 1000;
      directoryCache.set(cached);
      return { record: cached, notModified: true };
    }
    // No cache entry but got 304 - treat as error
    throw new Error('Invalid 304 response');
  }

  // Check status
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  // Verify content type
  const contentType = response.headers.get('content-type')?.toLowerCase();
  if (!contentType?.includes('application/http-message-signatures-directory+json')) {
    throw new Error('dir_media');
  }

  // Read body with size limit
  const body = await readResponseWithSizeLimit(response, options.maxSizeBytes!);

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON');
  }

  // Validate structure
  if (
    !data ||
    typeof data !== 'object' ||
    !('keys' in data) ||
    !Array.isArray((data as { keys: unknown }).keys) ||
    (data as { keys: unknown[] }).keys.length === 0 ||
    (data as { keys: unknown[] }).keys.length > 10
  ) {
    throw new Error('Invalid directory structure');
  }

  // Parse Signature header for verification
  const signatureHeader = response.headers.get('signature');
  const signatureInputHeader = response.headers.get('signature-input');

  if (!signatureHeader || !signatureInputHeader) {
    throw new Error('dir_sig_invalid');
  }

  // Verify signature using keys from directory
  const verifiedKeys: Array<{ thumbprint: string; jwk: JWK }> = [];

  for (const key of (data as { keys: unknown[] }).keys) {
    if (!isValidEd25519JWK(key)) {
      throw new Error('Invalid Ed25519 JWK');
    }

    const thumbprint = thumbprintEd25519(key);

    // Try to verify signature with this key
    const signatureValid = await verifyDirectorySignature(
      signatureHeader,
      signatureInputHeader,
      key,
      response,
      body,
      options,
    );

    if (signatureValid) {
      verifiedKeys.push({ thumbprint, jwk: key });
    }
  }

  if (verifiedKeys.length === 0) {
    throw new Error('dir_sig_invalid');
  }

  // Check TOFU pinning
  const cached = directoryCache.get(origin);
  const newThumbs = new Set(verifiedKeys.map((k) => k.thumbprint));

  if (cached && cached.pinnedThumbs) {
    // Require overlap on rotation
    if (!hasThumbprintOverlap(cached.pinnedThumbs, newThumbs)) {
      logger.warn(
        { origin, oldThumbs: [...cached.pinnedThumbs], newThumbs: [...newThumbs] },
        'dir_keyset_jump',
      );
      throw new Error('dir_keyset_jump');
    }
  }

  // Calculate expiry
  const expiresAt = Math.min(
    now + options.ttlCapSec! * 1000,
    // Could also extract from signature expires if present
  );

  // Build record
  const record: DirRecord = {
    origin,
    etag: response.headers.get('etag') || undefined,
    lastModified: response.headers.get('last-modified') || undefined,
    verifiedAt: now,
    expiresAt,
    keys: verifiedKeys,
    pinnedThumbs: newThumbs,
  };

  // Cache it
  directoryCache.set(record);

  logger.info(
    {
      origin,
      keyCount: verifiedKeys.length,
      thumbprints: [...newThumbs],
    },
    'dir_fetch',
  );

  return { record, notModified: false };
}

async function verifyDirectorySignature(
  signatureHeader: string,
  signatureInputHeader: string,
  key: JWK,
  response: Response,
  _body: string,
  options: DirectoryFetchOptions,
): Promise<boolean> {
  try {
    // Parse signature input
    const inputs = parseSignatureInput(signatureInputHeader);
    const dirSig = inputs.find((i) => i.tag === 'http-message-signatures-directory');

    if (!dirSig) {
      return false;
    }

    // Check keyid matches thumbprint
    const thumbprint = thumbprintEd25519(
      key as unknown as { kty: 'OKP'; crv: 'Ed25519'; x: string },
    );
    if (dirSig.keyid !== thumbprint) {
      return false;
    }

    // Check created/expires
    const now = options.now!() / 1000;
    if (dirSig.created && dirSig.created > now + options.skewSec!) {
      return false; // Future
    }
    if (dirSig.expires && dirSig.expires < now - options.skewSec!) {
      return false; // Expired
    }

    // Build signature base
    const base = buildSignatureBase(dirSig.components, response, _body);

    // Verify Ed25519 signature
    return verifyEd25519(base, signatureHeader, key);
  } catch {
    return false;
  }
}

function parseSignatureInput(header: string): Array<{
  tag: string;
  keyid?: string;
  created?: number;
  expires?: number;
  components: string[];
}> {
  // Simplified parser for signature-input
  // Real implementation would use full SF parser
  const results = [];
  const parts = header.split(',');

  for (const part of parts) {
    const match = part.match(/(\w+)=\((.*?)\);(.+)/);
    if (!match) continue;

    const [, tag, components, params] = match;
    const result: {
      tag: string;
      components: string[];
      keyid?: string;
      created?: number;
      expires?: number;
    } = {
      tag,
      components: components.split(' ').map((c) => c.replace(/"/g, '')),
    };

    // Parse params
    if (params.includes('keyid=')) {
      const keyidMatch = params.match(/keyid="([^"]+)"/);
      if (keyidMatch) result.keyid = keyidMatch[1];
    }
    if (params.includes('created=')) {
      const createdMatch = params.match(/created=(\d+)/);
      if (createdMatch) result.created = parseInt(createdMatch[1]);
    }
    if (params.includes('expires=')) {
      const expiresMatch = params.match(/expires=(\d+)/);
      if (expiresMatch) result.expires = parseInt(expiresMatch[1]);
    }

    results.push(result);
  }

  return results;
}

function buildSignatureBase(components: string[], response: Response, _body: string): string {
  const lines = [];

  for (const comp of components) {
    if (comp.startsWith('@')) {
      // Derived component
      switch (comp) {
        case '@status':
          lines.push(`"@status": ${response.status}`);
          break;
        case '@method':
          lines.push(`"@method": GET`);
          break;
        case '@target-uri':
          lines.push(`"@target-uri": ${response.url}`);
          break;
        case '@authority':
          lines.push(`"@authority": ${new URL(response.url).host}`);
          break;
      }
    } else {
      // Regular header
      const value = response.headers.get(comp);
      if (value) {
        lines.push(`"${comp}": ${value}`);
      }
    }
  }

  // Add signature params
  lines.push(`"@signature-params": ${components.map((c) => `"${c}"`).join(' ')}`);

  return lines.join('\n');
}

async function verifyEd25519(base: string, signatureHeader: string, key: JWK): Promise<boolean> {
  try {
    // Parse signature value (sf-binary)
    const sigMatch = signatureHeader.match(/:([A-Za-z0-9+/=]+):/);
    if (!sigMatch) return false;

    const signature = Buffer.from(sigMatch[1], 'base64');

    // Import key
    const publicKey = crypto.createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: key.x,
      },
      format: 'jwk',
    });

    // Verify
    return crypto.verify(null, Buffer.from(base, 'utf-8'), publicKey, signature);
  } catch {
    return false;
  }
}

async function readResponseWithSizeLimit(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  let totalBytes = 0;
  const chunks: Uint8Array[] = [];

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        throw new Error(`Response too large: ${totalBytes} > ${maxBytes}`);
      }

      chunks.push(value);
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder('utf-8').decode(combined);
  } finally {
    reader.releaseLock();
  }
}

// Legacy alias for backward compatibility
export const fetchAndVerifyDirectory = fetchAndVerifyDir;

export function validateSignatureAgentUrl(
  url: string,
  options: DirectoryFetchOptions = {},
): boolean {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    if (url.length > 2048) return false;

    const parsed = new URL(url);

    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.hash) return false;

    const port = parseInt(parsed.port || '443', 10);
    if (!opts.allowedPorts.includes(port)) return false;

    const hostname = parsed.hostname;

    // Reject IP literals
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || /^\[.*\]$/.test(hostname)) {
      return false;
    }

    // Use PSL to validate domain
    const domain = getDomain(hostname);
    if (!domain || domain === hostname) {
      return false; // Invalid or single-label domain
    }

    // Reject internal/private TLDs
    const forbiddenTlds = ['.local', '.internal', '.corp', '.test'];
    if (forbiddenTlds.some((tld) => hostname.endsWith(tld))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
