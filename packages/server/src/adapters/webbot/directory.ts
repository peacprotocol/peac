import { thumbprintEd25519, isValidEd25519JWK } from './jwk';
import { logger } from '../../logging';
import { getDomain } from 'tldts';

export interface VerifiedDirectory {
  origin: string;
  keys: Array<{ x: string; kid: string }>;
  exp: number;
}

export interface DirectoryFetchOptions {
  fetchFn?: typeof fetch;
  now?: () => number;
  ttlSec?: number;
  skewSec?: number;
  timeoutMs?: number;
  maxSizeBytes?: number;
  allowedPorts?: number[];
}

const DEFAULT_OPTIONS: Required<DirectoryFetchOptions> = {
  fetchFn: fetch,
  now: () => Date.now(),
  ttlSec: 600, // 10 minutes
  skewSec: 120, // 2 minutes
  timeoutMs: 2000,
  maxSizeBytes: 32768, // 32KB
  allowedPorts: [443],
};

interface CacheEntry {
  directory: VerifiedDirectory;
  expiresAt: number;
}

const directoryCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<VerifiedDirectory>>();

export function validateSignatureAgentUrl(url: string, options: DirectoryFetchOptions = {}): boolean {
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
    if (forbiddenTlds.some(tld => hostname.endsWith(tld))) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

async function fetchDirectoryWithTimeout(
  url: string,
  options: DirectoryFetchOptions
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);
  
  try {
    const response = await opts.fetchFn(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'Accept': 'application/http-message-signatures-directory+json',
        'User-Agent': 'PEAC/0.9.9',
      },
    });
    
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        const originalOrigin = new URL(url).origin;
        const redirectOrigin = new URL(location, url).origin;
        
        if (originalOrigin !== redirectOrigin) {
          throw new Error('Cross-origin redirect not allowed');
        }
        
        return await fetchDirectoryWithTimeout(location, options);
      }
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type')?.toLowerCase();
    if (contentType !== 'application/http-message-signatures-directory+json') {
      throw new Error('Invalid content type');
    }
    
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponseWithSizeLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
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

export async function fetchAndVerifyDirectory(
  agentUrl: string,
  options: DirectoryFetchOptions = {}
): Promise<VerifiedDirectory> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!validateSignatureAgentUrl(agentUrl, opts)) {
    throw new Error('Invalid signature agent URL');
  }
  
  const origin = new URL(agentUrl).origin;
  
  const cached = directoryCache.get(origin);
  if (cached && cached.expiresAt > opts.now()) {
    return cached.directory;
  }
  
  const existing = inflightRequests.get(origin);
  if (existing) {
    return existing;
  }
  
  const promise = fetchDirectoryInternal(agentUrl, opts);
  inflightRequests.set(origin, promise);
  
  try {
    const result = await promise;
    
    directoryCache.set(origin, {
      directory: result,
      expiresAt: opts.now() + (opts.ttlSec * 1000),
    });
    
    return result;
  } finally {
    inflightRequests.delete(origin);
  }
}

async function fetchDirectoryInternal(
  agentUrl: string,
  options: DirectoryFetchOptions
): Promise<VerifiedDirectory> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const directoryUrl = `${agentUrl}/.well-known/http-message-signatures-directory`;
  
  logger.debug({ agentUrl, directoryUrl }, 'Fetching agent directory');
  
  const response = await fetchDirectoryWithTimeout(directoryUrl, opts);
  const body = await readResponseWithSizeLimit(response, opts.maxSizeBytes);
  
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON in directory response');
  }
  
  if (!data || typeof data !== 'object' || 
      !('keys' in data) || !('nonce' in data) || 
      !Array.isArray(data.keys) || data.keys.length === 0 || data.keys.length > 10) {
    throw new Error('Invalid directory structure');
  }
  
  const keys: Array<{ x: string; kid: string }> = [];
  for (const key of data.keys) {
    if (!isValidEd25519JWK(key)) {
      throw new Error('Invalid Ed25519 JWK in directory');
    }
    
    const kid = thumbprintEd25519(key);
    keys.push({ x: key.x, kid });
  }
  
  const origin = new URL(agentUrl).origin;
  
  return {
    origin,
    keys,
    exp: opts.now() + (opts.ttlSec * 1000),
  };
}