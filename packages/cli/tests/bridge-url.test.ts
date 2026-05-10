/**
 * Unit tests for the bridge URL helpers in
 * `packages/cli/src/lib/bridge-url.ts`. The helpers exist so the bridge
 * URL value (which originates from a config file or env var) is parsed
 * through a single barrier before reaching any `fetch()` sink and so
 * configured base path prefixes are preserved when endpoint paths are
 * appended.
 */

import { describe, expect, it } from 'vitest';
import { joinBridgePath, parseBridgeBaseUrl } from '../src/lib/bridge-url.js';

describe('parseBridgeBaseUrl', () => {
  it('accepts an http URL', () => {
    expect(parseBridgeBaseUrl('http://127.0.0.1:3000').protocol).toBe('http:');
  });

  it('accepts an https URL', () => {
    expect(parseBridgeBaseUrl('https://bridge.example.com').protocol).toBe('https:');
  });

  it('rejects a non-http(s) protocol', () => {
    expect(() => parseBridgeBaseUrl('file:///tmp/bridge.sock')).toThrow(/http.*https/i);
  });

  it('rejects a non-string input', () => {
    expect(() => parseBridgeBaseUrl(undefined)).toThrow(TypeError);
    expect(() => parseBridgeBaseUrl(42)).toThrow(TypeError);
  });

  it('rejects an empty string', () => {
    expect(() => parseBridgeBaseUrl('')).toThrow(TypeError);
  });
});

describe('joinBridgePath', () => {
  it('joins an endpoint onto a root bridge URL', () => {
    const base = parseBridgeBaseUrl('http://127.0.0.1:3000');
    expect(joinBridgePath(base, '/health').toString()).toBe('http://127.0.0.1:3000/health');
  });

  it('preserves a configured path prefix without a trailing slash', () => {
    const base = parseBridgeBaseUrl('https://example.com/bridge');
    expect(joinBridgePath(base, '/ready').toString()).toBe('https://example.com/bridge/ready');
  });

  it('preserves a configured path prefix with a trailing slash', () => {
    const base = parseBridgeBaseUrl('https://example.com/bridge/');
    expect(joinBridgePath(base, '/verify').toString()).toBe('https://example.com/bridge/verify');
  });

  it('collapses doubled slashes in the joined pathname', () => {
    const base = parseBridgeBaseUrl('https://example.com//bridge//');
    expect(joinBridgePath(base, '//health').toString()).toBe('https://example.com/bridge/health');
  });

  it('drops query and fragment from the base before joining', () => {
    const base = parseBridgeBaseUrl('https://example.com/bridge?token=abc#section');
    expect(joinBridgePath(base, '/health').toString()).toBe('https://example.com/bridge/health');
  });

  it('strips leading slashes from the endpoint segment', () => {
    const base = parseBridgeBaseUrl('https://example.com/bridge/');
    expect(joinBridgePath(base, '///health').toString()).toBe('https://example.com/bridge/health');
  });
});
