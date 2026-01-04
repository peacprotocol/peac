import { describe, it, expect } from 'vitest';
import { applyPurposeVary, getPeacVaryHeaders, needsPurposeVary, VARY_HEADERS } from '../http.js';

describe('VARY_HEADERS', () => {
  it('includes PEAC-Purpose and PEAC-Receipt', () => {
    expect(VARY_HEADERS).toContain('PEAC-Purpose');
    expect(VARY_HEADERS).toContain('PEAC-Receipt');
    expect(VARY_HEADERS).toHaveLength(2);
  });
});

describe('applyPurposeVary', () => {
  describe('with Web API Headers', () => {
    it('sets Vary when no existing header', () => {
      const headers = new Headers();
      applyPurposeVary(headers);
      expect(headers.get('Vary')).toBe('PEAC-Purpose');
    });

    it('appends to existing Vary header', () => {
      const headers = new Headers();
      headers.set('Vary', 'Accept-Encoding');
      applyPurposeVary(headers);
      // Headers.append behavior
      expect(headers.get('Vary')).toContain('Accept-Encoding');
      expect(headers.get('Vary')).toContain('PEAC-Purpose');
    });

    it('does not duplicate when PEAC-Purpose already present', () => {
      const headers = new Headers();
      headers.set('Vary', 'PEAC-Purpose');
      applyPurposeVary(headers);
      expect(headers.get('Vary')).toBe('PEAC-Purpose');
    });

    it('handles case-insensitive match', () => {
      const headers = new Headers();
      headers.set('Vary', 'peac-purpose');
      applyPurposeVary(headers);
      // Should not duplicate
      expect(headers.get('Vary')).toBe('peac-purpose');
    });

    it('handles Vary: * (wildcard)', () => {
      const headers = new Headers();
      headers.set('Vary', '*');
      applyPurposeVary(headers);
      // Wildcard means vary on everything, no need to append
      expect(headers.get('Vary')).toContain('*');
    });

    it('is idempotent when called twice', () => {
      const headers = new Headers();
      applyPurposeVary(headers);
      applyPurposeVary(headers);
      expect(headers.get('Vary')).toBe('PEAC-Purpose');
    });

    it('works for deny responses (vary must apply to denials too)', () => {
      // Deny responses must also vary to prevent caching denial across purposes
      const headers = new Headers();
      headers.set('PEAC-Decision', 'deny');
      applyPurposeVary(headers);
      expect(headers.get('Vary')).toBe('PEAC-Purpose');
    });
  });

  describe('with Node.js-like response object', () => {
    it('sets Vary via setHeader', () => {
      const headers: Record<string, string> = {};
      const res = {
        getHeader: (name: string) => headers[name.toLowerCase()],
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        },
      };
      applyPurposeVary(res);
      expect(headers['vary']).toBe('PEAC-Purpose');
    });

    it('appends to existing Vary via setHeader', () => {
      const headers: Record<string, string> = { vary: 'Accept-Encoding' };
      const res = {
        getHeader: (name: string) => headers[name.toLowerCase()],
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        },
      };
      applyPurposeVary(res);
      expect(headers['vary']).toBe('Accept-Encoding, PEAC-Purpose');
    });

    it('does not duplicate when already present', () => {
      const headers: Record<string, string> = { vary: 'PEAC-Purpose' };
      const res = {
        getHeader: (name: string) => headers[name.toLowerCase()],
        setHeader: (name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        },
      };
      applyPurposeVary(res);
      expect(headers['vary']).toBe('PEAC-Purpose');
    });
  });

  describe('with Map-like headers (Hono, etc.)', () => {
    it('sets Vary via set method', () => {
      const map = new Map<string, string>();
      const headers = {
        set: (name: string, value: string) => map.set(name, value),
      };
      applyPurposeVary(headers);
      expect(map.get('Vary')).toBe('PEAC-Purpose');
    });
  });
});

describe('getPeacVaryHeaders', () => {
  it('returns comma-separated list of PEAC headers', () => {
    const result = getPeacVaryHeaders();
    expect(result).toBe('PEAC-Purpose, PEAC-Receipt');
  });
});

describe('needsPurposeVary', () => {
  it('returns true when purpose was enforced', () => {
    expect(needsPurposeVary(true)).toBe(true);
  });

  it('returns false when purpose was not enforced', () => {
    expect(needsPurposeVary(false)).toBe(false);
  });
});
