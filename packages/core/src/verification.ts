/**
 * @peac/core v0.9.12.1 - RDNS/IP/UA verification with trust scoring
 * Deterministic verification system with graceful degradation
 */

import { promises as dns } from 'dns';
import { FEATURES, TRUST_CONFIG } from './config.js';
import { VerificationResult, TrustScoreParams, Discovery } from './types.js';

export interface RDNSResult {
  forward_hostname?: string; // PTR(ip) -> hostname
  reverse_ips?: string[]; // A/AAAA(hostname) -> ips
  match: boolean; // ip in reverse_ips AND hostname suffix allowed
  suffix_ok: boolean; // hostname endsWith any allowed suffix
}

export async function verifyCrawler(
  reqIp: string,
  userAgent: string,
  discovery: Discovery
): Promise<VerificationResult> {
  if (!FEATURES.RDNS_VERIFICATION) {
    return createUnverifiedResult();
  }

  const indicators: string[] = [];

  try {
    // 1) RDNS verification (with timeout)
    const rdnsResult = await verifyRDNS(reqIp, discovery, indicators);

    // 2) IP range verification
    const ipInRange = verifyIPRange(reqIp, discovery);
    if (!ipInRange) indicators.push('ip_not_in_known_range');

    // 3) User-Agent consistency check
    const uaConsistent = verifyUserAgent(userAgent, discovery);
    if (!uaConsistent) indicators.push('ua_inconsistent');

    // 4) Compute trust score
    const trustScore = FEATURES.TRUST_SCORING
      ? computeTrustScore({
          rdns_match: rdnsResult.match,
          ip_in_range: ipInRange,
          user_agent_valid: uaConsistent,
          rate_compliant: true, // Will be set by rate limiter
        })
      : 0.5; // Neutral score when trust scoring disabled

    return {
      ip_verified: rdnsResult.match || ipInRange,
      rdns_match: rdnsResult.match,
      user_agent_consistent: uaConsistent,
      stealth_indicators: indicators,
      trust_score: trustScore,
      rdns_details: rdnsResult,
    };
  } catch (error) {
    console.warn('Crawler verification failed, degrading gracefully:', error);
    indicators.push('verification_error');

    return {
      ip_verified: false,
      rdns_match: false,
      user_agent_consistent: false,
      stealth_indicators: indicators,
      trust_score: 0.1, // Low trust on verification failure
      rdns_details: { match: false, suffix_ok: false },
    };
  }
}

export async function verifyRDNS(
  reqIp: string,
  discovery: Discovery,
  indicators: string[]
): Promise<RDNSResult> {
  try {
    // 1) PTR lookup (forward: IP -> hostname)
    let forward_hostname: string | undefined;
    try {
      const ptrRecords = await dns.reverse(reqIp);
      forward_hostname = ptrRecords?.[0];
    } catch {
      indicators.push('ptr_nxdomain');
    }

    if (!forward_hostname) {
      return { match: false, suffix_ok: false };
    }

    // 2) A/AAAA lookup (reverse: hostname -> IPs)
    let reverse_ips: string[] = [];
    try {
      const addresses = await dns.lookup(forward_hostname, { all: true });
      reverse_ips = addresses.map((addr) => addr.address);
    } catch {
      indicators.push('a_lookup_fail');
    }

    // 3) Suffix validation
    const allowedSuffixes =
      discovery.crawler_verification?.known_crawlers?.flatMap(
        (crawler) => crawler.rdns_suffixes || []
      ) || [];

    const suffix_ok =
      allowedSuffixes.length === 0 ||
      allowedSuffixes.some((suffix) => forward_hostname!.endsWith(suffix));

    if (!suffix_ok) {
      indicators.push('rdns_suffix_mismatch');
    }

    // 4) IP match verification
    const match = reverse_ips.includes(reqIp) && suffix_ok;

    if (!match && reverse_ips.length > 0) {
      indicators.push('rdns_mismatch');
    }

    return {
      forward_hostname,
      reverse_ips,
      match,
      suffix_ok,
    };
  } catch (error) {
    indicators.push('rdns_error');
    return { match: false, suffix_ok: false };
  }
}

export function verifyIPRange(reqIp: string, discovery: Discovery): boolean {
  const knownRanges =
    discovery.crawler_verification?.known_crawlers?.flatMap((crawler) => crawler.ip_ranges || []) ||
    [];

  return knownRanges.some((range) => isIPInRange(reqIp, range));
}

export function verifyUserAgent(userAgent: string, discovery: Discovery): boolean {
  if (!userAgent || userAgent.length === 0) return false;

  const knownPatterns =
    discovery.crawler_verification?.known_crawlers?.flatMap(
      (crawler) => crawler.user_agents || []
    ) || [];

  if (knownPatterns.length === 0) return true; // Allow if no patterns configured

  // Check against known patterns (simple substring matching)
  const matches = knownPatterns.some((pattern) => {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(userAgent);
    } catch {
      return userAgent.toLowerCase().includes(pattern.toLowerCase());
    }
  });

  // Basic stealth detection - look for obvious spoofing
  const suspiciousPatterns = [
    /Mozilla.*Chrome.*Safari.*bot/i, // Bot claiming to be browser
    /curl|wget|python|java|go-http/i, // Command line tools
    /HeadlessChrome|PhantomJS|Selenium/i, // Automation tools
  ];

  const isSuspicious = suspiciousPatterns.some((pattern) => pattern.test(userAgent));

  return matches && !isSuspicious;
}

export function computeTrustScore(params: TrustScoreParams): number {
  const weights = TRUST_CONFIG.weights;

  const score =
    (params.rdns_match ? 1 : 0) * weights.rdns_match +
    (params.ip_in_range ? 1 : 0) * weights.ip_in_range +
    (params.user_agent_valid ? 1 : 0) * weights.user_agent_valid +
    (params.rate_compliant ? 1 : 0) * weights.rate_compliance;

  return Math.max(0, Math.min(1, score));
}

export function getTrustLevel(score: number): 'trusted' | 'suspicious' | 'untrusted' {
  const thresholds = TRUST_CONFIG.thresholds;

  if (score >= thresholds.trusted) return 'trusted';
  if (score >= thresholds.suspicious) return 'suspicious';
  return 'untrusted';
}

function createUnverifiedResult(): VerificationResult {
  return {
    ip_verified: false,
    rdns_match: false,
    user_agent_consistent: false,
    stealth_indicators: ['verification_disabled'],
    trust_score: 0.5, // Neutral when verification disabled
    rdns_details: { match: false, suffix_ok: false },
  };
}

function isIPInRange(ip: string, cidr: string): boolean {
  try {
    // Simple CIDR matching implementation
    // In production, use a proper IP library like 'ip-address' or 'netmask'
    const [network, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr);

    if (prefix === undefined || prefix < 0 || prefix > 32) return false;

    const ipNum = ipToNumber(ip);
    const networkNum = ipToNumber(network);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;

    return (ipNum & mask) === (networkNum & mask);
  } catch {
    return false;
  }
}

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

// Known crawler configurations (can be loaded from external config)
export const KNOWN_CRAWLERS = [
  {
    name: 'googlebot',
    ip_ranges: ['66.249.64.0/19', '72.14.192.0/18'],
    user_agents: ['Googlebot', 'Mozilla/5.0.*Googlebot'],
    rdns_suffixes: ['.googlebot.com', '.google.com'],
  },
  {
    name: 'bingbot',
    ip_ranges: ['40.77.167.0/24', '207.46.13.0/24'],
    user_agents: ['bingbot', 'Mozilla/5.0.*compatible.*bingbot'],
    rdns_suffixes: ['.search.msn.com'],
  },
  {
    name: 'gptbot',
    ip_ranges: ['143.110.0.0/16'], // Example - would need real OpenAI ranges
    user_agents: ['GPTBot', 'Mozilla/5.0.*GPTBot'],
    rdns_suffixes: ['.openai.com'],
  },
];
