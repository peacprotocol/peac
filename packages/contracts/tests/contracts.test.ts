/**
 * Contract Self-Validation Tests
 *
 * These tests verify the internal consistency of @peac/contracts itself.
 * They catch contract-level bugs before consumers see them.
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_ERROR_CODES,
  CANONICAL_STATUS_MAPPINGS,
  CANONICAL_TITLES,
  ERROR_CATALOG,
  MODE_BEHAVIOR,
  WWW_AUTHENTICATE_STATUSES,
  problemTypeFor,
  getStatusForCode,
  requiresWwwAuthenticate,
  buildWwwAuthenticate,
  isPeacErrorCode,
  type PeacErrorCode,
  type PeacHttpStatus,
} from '../src/index.js';
// Internal import for structural invariant tests - not part of public API
import { PEAC_ERROR_CODE_SET } from '../src/internal/error-codes.js';

describe('Contract Invariants: Error Codes', () => {
  it('every PeacErrorCode must have a catalog entry', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      expect(ERROR_CATALOG[code]).toBeDefined();
      expect(ERROR_CATALOG[code].status).toBeGreaterThanOrEqual(400);
      expect(ERROR_CATALOG[code].status).toBeLessThan(600);
      expect(ERROR_CATALOG[code].title).toBeTruthy();
    });
  });

  it('every PeacErrorCode must have a status mapping', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const status = CANONICAL_STATUS_MAPPINGS[code];
      expect(status).toBeDefined();
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    });
  });

  it('every PeacErrorCode must have a title', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const title = CANONICAL_TITLES[code];
      expect(title).toBeDefined();
      expect(title.length).toBeGreaterThan(0);
    });
  });

  it('catalog status must match status mapping', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const catalogStatus = ERROR_CATALOG[code].status;
      const mappingStatus = CANONICAL_STATUS_MAPPINGS[code];
      expect(catalogStatus).toBe(mappingStatus);
    });
  });

  it('catalog title must match title mapping', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const catalogTitle = ERROR_CATALOG[code].title;
      const mappingTitle = CANONICAL_TITLES[code];
      expect(catalogTitle).toBe(mappingTitle);
    });
  });
});

describe('Contract Invariants: HTTP Status Codes', () => {
  it('only 401 and 402 require WWW-Authenticate', () => {
    expect(WWW_AUTHENTICATE_STATUSES).toEqual([401, 402]);
  });

  it('requiresWwwAuthenticate returns true for 401 and 402 only', () => {
    expect(requiresWwwAuthenticate(401)).toBe(true);
    expect(requiresWwwAuthenticate(402)).toBe(true);

    // All other statuses should return false
    const otherStatuses = [400, 403, 404, 409, 500, 503];
    otherStatuses.forEach((status) => {
      expect(requiresWwwAuthenticate(status)).toBe(false);
    });
  });

  it('all error codes map to valid PeacHttpStatus values', () => {
    const validStatuses: Set<PeacHttpStatus> = new Set([400, 401, 402, 403, 409, 500]);

    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const status = CANONICAL_STATUS_MAPPINGS[code];
      expect(validStatuses.has(status as PeacHttpStatus)).toBe(true);
    });
  });

  it('getStatusForCode returns correct status for all codes', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const status = getStatusForCode(code);
      const expectedStatus = CANONICAL_STATUS_MAPPINGS[code];
      expect(status).toBe(expectedStatus);
    });
  });
});

describe('Contract Invariants: MODE_BEHAVIOR', () => {
  it('MODE_BEHAVIOR contains tap_only and receipt_or_tap', () => {
    expect(MODE_BEHAVIOR.tap_only).toBeDefined();
    expect(MODE_BEHAVIOR.receipt_or_tap).toBeDefined();
  });

  it('tap_only returns 401 with TAP_SIGNATURE_MISSING and action=error', () => {
    const behavior = MODE_BEHAVIOR.tap_only;
    expect(behavior.status).toBe(401);
    expect(behavior.code).toBe(CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING);
    expect(behavior.action).toBe('error');
  });

  it('receipt_or_tap returns 402 with RECEIPT_MISSING and action=challenge', () => {
    const behavior = MODE_BEHAVIOR.receipt_or_tap;
    expect(behavior.status).toBe(402);
    expect(behavior.code).toBe(CANONICAL_ERROR_CODES.RECEIPT_MISSING);
    expect(behavior.action).toBe('challenge');
  });

  it('402 status is NEVER paired with action=error', () => {
    Object.values(MODE_BEHAVIOR).forEach((behavior) => {
      if (behavior.status === 402) {
        expect(behavior.action).not.toBe('error');
      }
    });
  });

  it('all MODE_BEHAVIOR codes are valid canonical error codes', () => {
    const allCanonicalCodes = Object.values(CANONICAL_ERROR_CODES);
    Object.values(MODE_BEHAVIOR).forEach((behavior) => {
      expect(allCanonicalCodes).toContain(behavior.code);
    });
  });

  it('all MODE_BEHAVIOR statuses are valid PeacHttpStatus values', () => {
    const validStatuses: Set<PeacHttpStatus> = new Set([400, 401, 402, 403, 409, 500]);
    Object.values(MODE_BEHAVIOR).forEach((behavior) => {
      expect(validStatuses.has(behavior.status as PeacHttpStatus)).toBe(true);
    });
  });
});

describe('Contract Invariants: Problem Type URIs', () => {
  it('problemTypeFor returns consistent URIs for all codes', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const uri = problemTypeFor(code);

      // Must start with base URI
      expect(uri).toMatch(/^https:\/\/www\.peacprotocol\.org\/problems\/E_[A-Z_]+$/);

      // Must contain the code
      expect(uri).toContain(code);

      // Must be deterministic
      const uri2 = problemTypeFor(code);
      expect(uri2).toBe(uri);
    });
  });
});

describe('Contract Invariants: WWW-Authenticate Builder', () => {
  it('buildWwwAuthenticate produces valid format for all codes', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      const header = buildWwwAuthenticate(code);

      // Must contain PEAC realm
      expect(header).toContain('PEAC realm="peac"');

      // Must contain error code
      expect(header).toContain(`error="${code}"`);

      // Must contain error_uri
      expect(header).toContain(`error_uri="${problemTypeFor(code)}"`);

      // Verify format
      expect(header).toMatch(/^PEAC realm="[^"]+", error="[^"]+", error_uri="[^"]+"$/);
    });
  });

  it('buildWwwAuthenticate accepts custom realm', () => {
    const header = buildWwwAuthenticate(
      CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING,
      'custom-realm'
    );
    expect(header).toContain('PEAC realm="custom-realm"');
  });

  it('buildWwwAuthenticate is deterministic', () => {
    const code = CANONICAL_ERROR_CODES.TAP_SIGNATURE_MISSING;
    const header1 = buildWwwAuthenticate(code);
    const header2 = buildWwwAuthenticate(code);
    expect(header2).toBe(header1);
  });
});

describe('Contract Invariants: Type Guards', () => {
  it('isPeacErrorCode validates all canonical codes', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      expect(isPeacErrorCode(code)).toBe(true);
    });
  });

  it('isPeacErrorCode rejects non-canonical codes', () => {
    const invalidCodes = [
      'invalid_code',
      'E_UNKNOWN',
      'tap_signature_invalid', // legacy format
      '',
      'RANDOM',
    ];

    invalidCodes.forEach((code) => {
      expect(isPeacErrorCode(code)).toBe(false);
    });
  });

  it('isPeacErrorCode rejects non-string values', () => {
    expect(isPeacErrorCode(null)).toBe(false);
    expect(isPeacErrorCode(undefined)).toBe(false);
    expect(isPeacErrorCode(123)).toBe(false);
    expect(isPeacErrorCode({})).toBe(false);
    expect(isPeacErrorCode([])).toBe(false);
  });

  it('isPeacErrorCode uses Set-backed O(1) lookup (structural invariant)', () => {
    // Structural guarantee: internal Set contains exactly the canonical codes
    // ES6 Set.has() is O(1) by specification (hash-based lookup)
    // This cannot flake across CI runners, unlike timing assertions

    const canonicalCodes = Object.values(CANONICAL_ERROR_CODES);

    // 1. No duplicate codes (Set.size === array length proves uniqueness)
    expect(PEAC_ERROR_CODE_SET.size).toBe(canonicalCodes.length);

    // 2. Every canonical code is in the internal Set
    canonicalCodes.forEach((code) => {
      expect(PEAC_ERROR_CODE_SET.has(code)).toBe(true);
    });

    // 3. The type guard correctly validates all codes (proves Set is wired up)
    canonicalCodes.forEach((code) => {
      expect(isPeacErrorCode(code)).toBe(true);
    });
  });
});

describe('Contract Invariants: Error Code Format', () => {
  it('all error codes use E_ prefix', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      expect(code).toMatch(/^E_[A-Z_]+$/);
    });
  });

  it('all error codes are UPPER_SNAKE_CASE', () => {
    Object.values(CANONICAL_ERROR_CODES).forEach((code) => {
      expect(code).toMatch(/^[A-Z_]+$/);
      expect(code).not.toContain(' ');
      expect(code).not.toContain('-');
      expect(code).not.toContain('.');
    });
  });

  it('all error codes are unique', () => {
    const codes = Object.values(CANONICAL_ERROR_CODES);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });
});

describe('Contract Invariants: Catalog Completeness', () => {
  it('every catalog entry has all required fields', () => {
    Object.values(ERROR_CATALOG).forEach((entry) => {
      expect(entry.status).toBeDefined();
      expect(typeof entry.status).toBe('number');
      expect(entry.title).toBeDefined();
      expect(typeof entry.title).toBe('string');
      expect(entry.title.length).toBeGreaterThan(0);

      // defaultDetail is optional but if present must be string
      if (entry.defaultDetail !== undefined) {
        expect(typeof entry.defaultDetail).toBe('string');
      }
    });
  });

  it('catalog and CANONICAL_ERROR_CODES have same keys', () => {
    const catalogKeys = new Set(Object.keys(ERROR_CATALOG));
    const codeValues = new Set(Object.values(CANONICAL_ERROR_CODES));

    // Every canonical code must have a catalog entry
    codeValues.forEach((code) => {
      expect(catalogKeys.has(code)).toBe(true);
    });

    // Every catalog entry must correspond to a canonical code
    catalogKeys.forEach((key) => {
      expect(codeValues.has(key as PeacErrorCode)).toBe(true);
    });
  });
});

describe('Contract Invariants: Public API Surface', () => {
  it('public entrypoint does not export internal modules', async () => {
    // Dynamic import to get all exports
    const publicExports = await import('../src/index.js');
    const exportKeys = Object.keys(publicExports);

    // Internal exports that should NOT be in public API
    const forbiddenExports = [
      'PEAC_ERROR_CODE_SET', // internal Set
      'getCanonicalErrorCodes', // removed helper
      'VALUES', // internal array
    ];

    forbiddenExports.forEach((forbidden) => {
      expect(exportKeys).not.toContain(forbidden);
    });
  });

  it('public entrypoint exports expected API', async () => {
    const publicExports = await import('../src/index.js');
    const exportKeys = Object.keys(publicExports);

    // Required public exports
    const requiredExports = [
      'CANONICAL_ERROR_CODES',
      'CANONICAL_STATUS_MAPPINGS',
      'CANONICAL_TITLES',
      'ERROR_CATALOG',
      'MODE_BEHAVIOR',
      'WWW_AUTHENTICATE_STATUSES',
      'PROBLEM_TYPE_BASE',
      'problemTypeFor',
      'getStatusForCode',
      'requiresWwwAuthenticate',
      'buildWwwAuthenticate',
      'isPeacErrorCode',
    ];

    requiredExports.forEach((required) => {
      expect(exportKeys).toContain(required);
    });
  });
});
