/**
 * @peac/telemetry-otel - W3C Trace Context tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateTraceparent,
  parseTraceparent,
  isSampled,
  extractTraceparentFromHeaders,
  extractTracestateFromHeaders,
  createTraceContextExtensions,
  TRACE_CONTEXT_KEYS,
} from '../src/trace-context.js';

describe('validateTraceparent', () => {
  it('should accept valid traceparent', () => {
    const valid = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    expect(validateTraceparent(valid)).toBe(valid);
  });

  it('should accept valid traceparent with different flags', () => {
    const valid = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00';
    expect(validateTraceparent(valid)).toBe(valid);
  });

  it('should reject invalid version', () => {
    const invalid = '01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    expect(validateTraceparent(invalid)).toBeUndefined();
  });

  it('should reject too short trace-id', () => {
    const invalid = '00-0af7651916cd43dd8448eb211c8031-b7ad6b7169203331-01';
    expect(validateTraceparent(invalid)).toBeUndefined();
  });

  it('should reject too short parent-id', () => {
    const invalid = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b716920333-01';
    expect(validateTraceparent(invalid)).toBeUndefined();
  });

  it('should reject all-zeros trace-id', () => {
    const invalid = '00-00000000000000000000000000000000-b7ad6b7169203331-01';
    expect(validateTraceparent(invalid)).toBeUndefined();
  });

  it('should reject all-zeros parent-id', () => {
    const invalid = '00-0af7651916cd43dd8448eb211c80319c-0000000000000000-01';
    expect(validateTraceparent(invalid)).toBeUndefined();
  });

  it('should reject uppercase hex', () => {
    const invalid = '00-0AF7651916CD43DD8448EB211C80319C-B7AD6B7169203331-01';
    expect(validateTraceparent(invalid)).toBeUndefined();
  });

  it('should reject empty string', () => {
    expect(validateTraceparent('')).toBeUndefined();
  });

  it('should reject non-hex characters', () => {
    const invalid = '00-0zf7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    expect(validateTraceparent(invalid)).toBeUndefined();
  });

  it('should reject missing separators', () => {
    const invalid = '000af7651916cd43dd8448eb211c80319cb7ad6b716920333101';
    expect(validateTraceparent(invalid)).toBeUndefined();
  });
});

describe('parseTraceparent', () => {
  it('should parse valid traceparent', () => {
    const traceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    const parts = parseTraceparent(traceparent);

    expect(parts.version).toBe('00');
    expect(parts.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(parts.parentId).toBe('b7ad6b7169203331');
    expect(parts.traceFlags).toBe('01');
  });
});

describe('isSampled', () => {
  it('should return true when sampled flag is set', () => {
    const sampled = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
    expect(isSampled(sampled)).toBe(true);
  });

  it('should return false when sampled flag is not set', () => {
    const notSampled = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00';
    expect(isSampled(notSampled)).toBe(false);
  });

  it('should handle complex flags', () => {
    // Other flags set but not sampled
    const flags02 = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-02';
    expect(isSampled(flags02)).toBe(false);

    // Sampled with other flags
    const flags03 = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-03';
    expect(isSampled(flags03)).toBe(true);
  });
});

describe('extractTraceparentFromHeaders', () => {
  const validTraceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

  it('should extract from lowercase header', () => {
    const headers = { traceparent: validTraceparent };
    expect(extractTraceparentFromHeaders(headers)).toBe(validTraceparent);
  });

  it('should extract from capitalized header', () => {
    const headers = { Traceparent: validTraceparent };
    expect(extractTraceparentFromHeaders(headers)).toBe(validTraceparent);
  });

  it('should extract from uppercase header', () => {
    const headers = { TRACEPARENT: validTraceparent };
    expect(extractTraceparentFromHeaders(headers)).toBe(validTraceparent);
  });

  it('should extract from array header', () => {
    const headers = { traceparent: [validTraceparent, 'ignored'] };
    expect(extractTraceparentFromHeaders(headers)).toBe(validTraceparent);
  });

  it('should return undefined for missing header', () => {
    const headers = {};
    expect(extractTraceparentFromHeaders(headers)).toBeUndefined();
  });

  it('should return undefined for invalid value', () => {
    const headers = { traceparent: 'invalid' };
    expect(extractTraceparentFromHeaders(headers)).toBeUndefined();
  });

  it('should return undefined for undefined value', () => {
    const headers = { traceparent: undefined };
    expect(extractTraceparentFromHeaders(headers)).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    const headers = { traceparent: [] as string[] };
    expect(extractTraceparentFromHeaders(headers)).toBeUndefined();
  });
});

describe('extractTracestateFromHeaders', () => {
  it('should extract valid tracestate', () => {
    const headers = { tracestate: 'vendor1=value1,vendor2=value2' };
    expect(extractTracestateFromHeaders(headers)).toBe('vendor1=value1,vendor2=value2');
  });

  it('should extract from capitalized header', () => {
    const headers = { Tracestate: 'vendor=value' };
    expect(extractTracestateFromHeaders(headers)).toBe('vendor=value');
  });

  it('should return undefined for empty string', () => {
    const headers = { tracestate: '' };
    expect(extractTracestateFromHeaders(headers)).toBeUndefined();
  });

  it('should return undefined for missing header', () => {
    const headers = {};
    expect(extractTracestateFromHeaders(headers)).toBeUndefined();
  });

  it('should reject too long tracestate', () => {
    const headers = { tracestate: 'x'.repeat(513) };
    expect(extractTracestateFromHeaders(headers)).toBeUndefined();
  });

  it('should accept max length tracestate', () => {
    const maxLength = 'x'.repeat(512);
    const headers = { tracestate: maxLength };
    expect(extractTracestateFromHeaders(headers)).toBe(maxLength);
  });
});

describe('createTraceContextExtensions', () => {
  const validTraceparent = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';

  it('should create extensions with traceparent', () => {
    const headers = { traceparent: validTraceparent };
    const extensions = createTraceContextExtensions(headers);

    expect(extensions).toEqual({
      [TRACE_CONTEXT_KEYS.TRACEPARENT]: validTraceparent,
    });
  });

  it('should include tracestate when present', () => {
    const headers = {
      traceparent: validTraceparent,
      tracestate: 'vendor=value',
    };
    const extensions = createTraceContextExtensions(headers);

    expect(extensions).toEqual({
      [TRACE_CONTEXT_KEYS.TRACEPARENT]: validTraceparent,
      [TRACE_CONTEXT_KEYS.TRACESTATE]: 'vendor=value',
    });
  });

  it('should return undefined without valid traceparent', () => {
    const headers = { tracestate: 'vendor=value' };
    const extensions = createTraceContextExtensions(headers);

    expect(extensions).toBeUndefined();
  });

  it('should return undefined with invalid traceparent', () => {
    const headers = { traceparent: 'invalid' };
    const extensions = createTraceContextExtensions(headers);

    expect(extensions).toBeUndefined();
  });
});

describe('TRACE_CONTEXT_KEYS', () => {
  it('should use w3c namespace (vendor-neutral)', () => {
    expect(TRACE_CONTEXT_KEYS.TRACEPARENT).toBe('w3c/traceparent');
    expect(TRACE_CONTEXT_KEYS.TRACESTATE).toBe('w3c/tracestate');
  });

  it('should NOT use io.opentelemetry namespace', () => {
    expect(TRACE_CONTEXT_KEYS.TRACEPARENT).not.toContain('opentelemetry');
    expect(TRACE_CONTEXT_KEYS.TRACESTATE).not.toContain('opentelemetry');
  });
});
