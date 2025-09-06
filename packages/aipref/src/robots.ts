/**
 * @peac/pref/robots - Robots.txt parser with AIPREF bridge
 * Extracts AI-relevant directives from robots.txt
 */

import type { AIPrefSnapshot, RobotsRule } from './types.js';

// SSRF protection: Check if hostname/IP is in private network range
function isPrivateNetwork(hostname: string): boolean {
  // Block localhost variants
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)) {
    return true;
  }
  
  // Block private IPv4 ranges (RFC 1918)
  const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    
    // 10.0.0.0/8
    if (a === 10) return true;
    
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    
    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;
  }
  
  // Block private IPv6 ranges
  if (hostname.includes(':')) {
    // ::1 already covered above
    // fc00::/7 (unique local)
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true;
    
    // fe80::/10 (link-local)
    if (hostname.startsWith('fe8') || hostname.startsWith('fe9') || 
        hostname.startsWith('fea') || hostname.startsWith('feb')) return true;
  }
  
  return false;
}

export function parseRobots(content: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  
  let currentAgent = '';
  let currentDirectives: Array<{field: string; value: string}> = [];
  
  for (const line of lines) {
    const [field, ...valueParts] = line.split(':');
    if (!field || valueParts.length === 0) continue;
    
    const fieldLower = field.toLowerCase().trim();
    const value = valueParts.join(':').trim();
    
    if (fieldLower === 'user-agent') {
      if (currentAgent && currentDirectives.length > 0) {
        rules.push({
          userAgent: currentAgent,
          directives: currentDirectives
        });
      }
      currentAgent = value;
      currentDirectives = [];
    } else if (currentAgent) {
      currentDirectives.push({ field: fieldLower, value });
    }
  }
  
  if (currentAgent && currentDirectives.length > 0) {
    rules.push({
      userAgent: currentAgent,
      directives: currentDirectives
    });
  }
  
  return rules;
}

export function robotsToAIPref(rules: RobotsRule[]): AIPrefSnapshot | null {
  const snapshot: AIPrefSnapshot = {};
  let hasPrefs = false;
  
  // Look for AI-related user agents and directives
  const aiAgents = ['gptbot', 'chatgpt-user', 'claude-web', 'anthropic-ai', 'openai', 'google-extended'];
  
  for (const rule of rules) {
    const ua = rule.userAgent.toLowerCase();
    const isAiAgent = aiAgents.some(agent => ua.includes(agent)) || ua === '*';
    
    if (isAiAgent) {
      for (const directive of rule.directives) {
        // Map robots directives to AIPREF fields
        switch (directive.field) {
          case 'disallow':
            if (directive.value === '/' || directive.value === '*') {
              snapshot.crawl = false;
              snapshot['train-ai'] = false;
              hasPrefs = true;
            }
            break;
          case 'allow':
            if (directive.value === '/' || directive.value === '*') {
              snapshot.crawl = true;
              hasPrefs = true;
            }
            break;
          case 'noai':
            snapshot['train-ai'] = false;
            hasPrefs = true;
            break;
          case 'nofollow':
            snapshot.crawl = false;
            hasPrefs = true;
            break;
        }
      }
    }
  }
  
  return hasPrefs ? snapshot : null;
}

export async function fetchRobots(uri: string, timeout = 5000): Promise<string | null> {
  try {
    const url = new URL(uri);
    
    // SSRF protection: Only allow HTTPS/HTTP schemes
    if (!['https:', 'http:'].includes(url.protocol)) {
      throw new Error('Invalid protocol: only https:// and http:// are allowed');
    }
    
    // SSRF protection: Block private IP ranges and localhost
    const hostname = url.hostname.toLowerCase();
    if (isPrivateNetwork(hostname)) {
      throw new Error('Access to private networks is not allowed');
    }
    
    const robotsUrl = new URL('/robots.txt', url.origin);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(robotsUrl.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'PEAC/0.9.12 (+https://peac.dev)' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}