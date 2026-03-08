/**
 * Export surface test for the blessed path
 *
 * Ensures that @peac/protocol exports everything needed for the
 * single-package quickstart documented in README.md.
 */

import { describe, it, expect } from 'vitest';
import * as protocol from '../src/index.js';

describe('@peac/protocol export surface', () => {
  it('exports generateKeypair for key generation', () => {
    expect(protocol.generateKeypair).toBeDefined();
    expect(typeof protocol.generateKeypair).toBe('function');
  });

  it('exports issue for receipt creation', () => {
    expect(protocol.issue).toBeDefined();
    expect(typeof protocol.issue).toBe('function');
  });

  it('exports verify for low-level JWS verification', () => {
    expect(protocol.verify).toBeDefined();
    expect(typeof protocol.verify).toBe('function');
  });

  it('exports verifyLocal for typed local verification', () => {
    expect(protocol.verifyLocal).toBeDefined();
    expect(typeof protocol.verifyLocal).toBe('function');
  });

  it('exports verifyReceipt for JWKS-based verification', () => {
    expect(protocol.verifyReceipt).toBeDefined();
    expect(typeof protocol.verifyReceipt).toBe('function');
  });

  it('exports issueWire01 for Wire 0.1 receipt creation', () => {
    expect(protocol.issueWire01).toBeDefined();
    expect(typeof protocol.issueWire01).toBe('function');
  });

  it('exports issueWire02 for explicit wire-pinned issuance', () => {
    expect(protocol.issueWire02).toBeDefined();
    expect(typeof protocol.issueWire02).toBe('function');
  });

  it('exports issueJws for header-centric flows', () => {
    expect(protocol.issueJws).toBeDefined();
    expect(typeof protocol.issueJws).toBe('function');
  });

  it('exports discovery utilities', () => {
    expect(protocol.parseDiscovery).toBeDefined();
    expect(protocol.fetchDiscovery).toBeDefined();
  });

  it('exports header utilities', () => {
    expect(protocol.setReceiptHeader).toBeDefined();
    expect(protocol.getReceiptHeader).toBeDefined();
  });
});
