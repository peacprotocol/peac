import ipaddr from 'ipaddr.js';
import { config } from '../config';

function isPrivateIp(host: string): boolean {
  try {
    // Strip IPv6 brackets if present
    const normalized = host.startsWith('[') && host.endsWith(']')
      ? host.slice(1, -1)
      : host;

    if (normalized.toLowerCase() === 'localhost') return true;

    const addr = ipaddr.parse(normalized);

    // IPv4-mapped IPv6 support
    const kind = addr.kind();
    if (kind === 'ipv6' && 'isIPv4MappedAddress' in addr && typeof addr.isIPv4MappedAddress === 'function' && addr.isIPv4MappedAddress()) {
      const v4Addr = 'toIPv4Address' in addr && typeof addr.toIPv4Address === 'function' ? addr.toIPv4Address() : null;
      if (v4Addr) {
        return isPrivateIp(v4Addr.toString());
      }
    }

    if (kind === 'ipv4') {
      const range = (addr as ipaddr.IPv4).range();
      return (
        range === 'private' ||
        range === 'loopback' ||
        range === 'linkLocal'
      );
    }

    if (kind === 'ipv6') {
      const range = (addr as ipaddr.IPv6).range();
      return range === 'loopback' || range === 'uniqueLocal' || range === 'linkLocal';
    }

    return false;
  } catch {
    // Not an IP literal → treat as hostname (allowed unless explicitly localhost)
    return false;
  }
}

export class SSRFGuard {
  private allowlist: Set<string>;

  constructor(allowlist: string[] = []) {
    this.allowlist = new Set(allowlist.map(s => s.toLowerCase()));
  }

  async assertAllowedOutbound(urlStr: string): Promise<void> {
    let u: URL;
    try {
      u = new URL(urlStr);
    } catch {
      throw new Error('invalid_url');
    }

    const proto = u.protocol.toLowerCase();
    if (proto !== 'http:' && proto !== 'https:') {
      throw new Error('blocked_scheme');
    }

    const hostLower = (u.hostname || '').toLowerCase();

    // Allowlist short-circuit
    if (this.allowlist.has(hostLower)) return;

    if (hostLower === 'localhost' || isPrivateIp(hostLower)) {
      throw new Error('blocked_address');
    }
  }

  async safeFetch(urlStr: string, init?: RequestInit): Promise<Response> {
    await this.assertAllowedOutbound(urlStr);
    return fetch(urlStr, init);
    // Note: Node 18+ global fetch assumed; polyfill if needed in older runtimes.
  }
}

// Singleton used by production code with configured allowlist
export const ssrfGuard = new SSRFGuard(config.network.ssrfAllowlist);
