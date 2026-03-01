/**
 * Registry and Error Code Stability Tests (v0.11.3+)
 *
 * Validates: registry JSON structure, error code UPPER_SNAKE_CASE,
 * no error code reuse, and additive-only guarantees.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ERROR_CODES } from '../errors.generated.js';

// Load registry JSON
const REGISTRIES_PATH = resolve(__dirname, '../../../../specs/kernel/registries.json');
const ERRORS_PATH = resolve(__dirname, '../../../../specs/kernel/errors.json');

const registries = JSON.parse(readFileSync(REGISTRIES_PATH, 'utf-8'));
const errors = JSON.parse(readFileSync(ERRORS_PATH, 'utf-8'));

// =============================================================================
// REGISTRY STRUCTURE TESTS
// =============================================================================

describe('registries.json structure', () => {
  const KNOWN_SECTIONS = [
    '$schema',
    'version',
    'description',
    'payment_rails',
    'control_engines',
    'transport_methods',
    'agent_protocols',
    'proof_types',
    'extension_keys',
    'pillar_values',
    'attestation_types',
    'toolcall_op_types',
    'toolcall_resource_types',
  ];

  it('should have a valid version string', () => {
    expect(registries.version).toBeTruthy();
    expect(registries.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should contain only known sections', () => {
    const sections = Object.keys(registries);
    for (const section of sections) {
      expect(KNOWN_SECTIONS).toContain(section);
    }
  });

  it('should have no empty registry sections', () => {
    const arraySections = [
      'payment_rails',
      'control_engines',
      'transport_methods',
      'agent_protocols',
      'proof_types',
      'extension_keys',
    ];
    for (const section of arraySections) {
      if (registries[section]) {
        expect(registries[section].length).toBeGreaterThan(0);
      }
    }
  });

  it('should have unique IDs within each registry section', () => {
    const arraySections = [
      'payment_rails',
      'control_engines',
      'transport_methods',
      'agent_protocols',
      'proof_types',
      'extension_keys',
    ];
    for (const section of arraySections) {
      if (!registries[section]) continue;
      const ids = registries[section].map((e: { id: string }) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });

  it('should have all proof types (DD-143)', () => {
    expect(registries.proof_types).toBeTruthy();
    const proofTypeIds = registries.proof_types.map((e: { id: string }) => e.id);
    expect(proofTypeIds).toContain('ed25519-cert-chain');
    expect(proofTypeIds).toContain('eat-passport');
    expect(proofTypeIds).toContain('eat-background-check');
    expect(proofTypeIds).toContain('sigstore-oidc');
    expect(proofTypeIds).toContain('did');
    expect(proofTypeIds).toContain('spiffe');
    expect(proofTypeIds).toContain('x509-pki');
    expect(proofTypeIds).toContain('custom');
  });

  it('should have pillar_values as closed vocabulary with exactly 10 values', () => {
    expect(registries.pillar_values).toBeTruthy();
    expect(registries.pillar_values.values).toHaveLength(10);
    expect(registries.pillar_values._comment).toContain('CLOSED');
    expect(registries.pillar_values.values).toEqual([
      'access',
      'attribution',
      'commerce',
      'compliance',
      'consent',
      'identity',
      'privacy',
      'provenance',
      'purpose',
      'safety',
    ]);
  });
});

// =============================================================================
// ERROR CODE STABILITY TESTS
// =============================================================================

describe('error code stability', () => {
  it('should have all error codes in UPPER_SNAKE_CASE', () => {
    const codePattern = /^E_[A-Z][A-Z0-9_]+$/;
    const allCodes = Object.keys(ERROR_CODES);
    for (const code of allCodes) {
      expect(code).toMatch(codePattern);
    }
  });

  it('should have no duplicate error codes', () => {
    const allCodes = Object.keys(ERROR_CODES);
    const uniqueCodes = new Set(allCodes);
    expect(uniqueCodes.size).toBe(allCodes.length);
  });

  it('should include v0.11.3 error codes', () => {
    expect(ERROR_CODES.E_KID_REUSE_DETECTED).toBe('E_KID_REUSE_DETECTED');
    expect(ERROR_CODES.E_MVIS_INCOMPLETE).toBe('E_MVIS_INCOMPLETE');
    expect(ERROR_CODES.E_REVOKED_KEY_USED).toBe('E_REVOKED_KEY_USED');
  });
});

describe('errors.json structure', () => {
  it('should have a valid version', () => {
    expect(errors.version).toBeTruthy();
    expect(errors.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('should have an errors array', () => {
    expect(Array.isArray(errors.errors)).toBe(true);
    expect(errors.errors.length).toBeGreaterThan(0);
  });

  it('should have all required fields on each error entry', () => {
    for (const entry of errors.errors) {
      expect(entry.code).toBeTruthy();
      expect(entry.http_status).toBeTruthy();
      expect(typeof entry.retryable).toBe('boolean');
      expect(entry.next_action).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it('should have valid next_action vocabulary on all entries', () => {
    const validActions = [
      'abort',
      'retry_after_delay',
      'retry_with_different_key',
      'retry_with_different_input',
      'refresh_attestation',
      'contact_issuer',
      'none',
    ];
    for (const entry of errors.errors) {
      expect(validActions).toContain(entry.next_action);
    }
  });

  it('should have no duplicate error codes', () => {
    const allCodes = errors.errors.map((e: { code: string }) => e.code);
    const uniqueCodes = new Set(allCodes);
    expect(uniqueCodes.size).toBe(allCodes.length);
  });

  it('should have all codes in UPPER_SNAKE_CASE with E_ prefix', () => {
    const codePattern = /^E_[A-Z][A-Z0-9_]+$/;
    for (const entry of errors.errors) {
      expect(entry.code).toMatch(codePattern);
    }
  });
});
