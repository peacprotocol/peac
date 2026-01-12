/**
 * Export surface tests for @peac/crypto
 *
 * These tests ensure that test-only utilities are NOT accidentally
 * exported from the main entry point. Production bundlers should
 * be able to tree-shake testkit away.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from '../src/index';

describe('@peac/crypto export surface', () => {
  it('should NOT export generateKeypairFromSeed from main entry', () => {
    // generateKeypairFromSeed is test-only and lives in @peac/crypto/testkit
    // It must NOT be exported from the main entry point
    expect('generateKeypairFromSeed' in crypto).toBe(false);
  });

  it('should export generateKeypair from main entry', () => {
    // The secure random-based keypair generator SHOULD be exported
    expect('generateKeypair' in crypto).toBe(true);
  });

  it('should export sign from main entry', () => {
    expect('sign' in crypto).toBe(true);
  });

  it('should export verify from main entry', () => {
    expect('verify' in crypto).toBe(true);
  });

  it('should export canonicalize from main entry', () => {
    expect('canonicalize' in crypto).toBe(true);
  });

  it('should export CryptoError from main entry', () => {
    expect('CryptoError' in crypto).toBe(true);
  });

  it('should export base64urlEncode from main entry', () => {
    expect('base64urlEncode' in crypto).toBe(true);
  });
});
