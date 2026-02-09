/**
 * Tests for peac.txt parser emit() sanitization
 */

import { describe, it, expect } from 'vitest';
import { parse, emit } from '../src/parser.js';

describe('emit() sanitization', () => {
  const validData = {
    verify: 'https://api.example.com/verify',
    payments: ['x402', 'stripe'],
    public_keys: [{ kid: 'key-1', alg: 'EdDSA', key: 'base64urlPublicKey' }],
  };

  it('should emit valid data without errors', () => {
    const output = emit(validData);
    expect(output).toContain('verify: https://api.example.com/verify');
    expect(output).toContain('payments: ["x402", "stripe"]');
    expect(output).toContain('public_keys: ["key-1:EdDSA:base64urlPublicKey"]');
  });

  it('should throw when payment contains a double quote', () => {
    expect(() => emit({ ...validData, payments: ['x"402'] })).toThrow(/Invalid payment/);
  });

  it('should throw when payment contains a colon', () => {
    expect(() => emit({ ...validData, payments: ['x:402'] })).toThrow(/Invalid payment/);
  });

  it('should throw when payment contains a bracket', () => {
    expect(() => emit({ ...validData, payments: ['x[402'] })).toThrow(/Invalid payment/);

    expect(() => emit({ ...validData, payments: ['x]402'] })).toThrow(/Invalid payment/);
  });

  it('should throw when payment contains a newline', () => {
    expect(() => emit({ ...validData, payments: ['x\n402'] })).toThrow(/Invalid payment/);
  });

  it('should throw when payment contains a control character', () => {
    expect(() => emit({ ...validData, payments: ['x\x00402'] })).toThrow(/Invalid payment/);
  });

  it('should throw when kid contains a colon', () => {
    expect(() =>
      emit({
        ...validData,
        public_keys: [{ kid: 'key:1', alg: 'EdDSA', key: 'abc' }],
      })
    ).toThrow(/Invalid kid/);
  });

  it('should throw when kid contains a bracket', () => {
    expect(() =>
      emit({
        ...validData,
        public_keys: [{ kid: 'key]1', alg: 'EdDSA', key: 'abc' }],
      })
    ).toThrow(/Invalid kid/);
  });

  it('should throw when alg contains a quote', () => {
    expect(() =>
      emit({
        ...validData,
        public_keys: [{ kid: 'key-1', alg: 'Ed"DSA', key: 'abc' }],
      })
    ).toThrow(/Invalid alg/);
  });

  it('should throw when key contains a control character', () => {
    expect(() =>
      emit({
        ...validData,
        public_keys: [{ kid: 'key-1', alg: 'EdDSA', key: 'abc\x01def' }],
      })
    ).toThrow(/Invalid key/);
  });
});

describe('parse/emit round-trip', () => {
  it('should round-trip valid peac.txt content', () => {
    const original = {
      verify: 'https://api.example.com/verify',
      receipts: 'required' as const,
      payments: ['x402', 'stripe'],
      public_keys: [{ kid: 'key-1', alg: 'EdDSA', key: 'base64urlPublicKey' }],
    };

    const emitted = emit(original);
    const parsed = parse(emitted);

    expect(parsed.valid).toBe(true);
    expect(parsed.data?.verify).toBe(original.verify);
    expect(parsed.data?.receipts).toBe(original.receipts);
    expect(parsed.data?.payments).toEqual(original.payments);
    expect(parsed.data?.public_keys).toEqual(original.public_keys);
  });
});
