import { describe, it, expect } from 'vitest';
import { createObservation } from '../src/observation.js';

describe('createObservation', () => {
  it('creates observation with no sources', () => {
    const obs = createObservation({
      target_uri: 'https://example.com',
    });
    expect(obs.target_uri).toBe('https://example.com');
    expect(obs.signals).toEqual([]);
    expect(obs.sources_checked).toEqual([]);
    expect(obs.observed_at).toBeTruthy();
  });

  it('creates observation from robots.txt only', () => {
    const obs = createObservation({
      target_uri: 'https://example.com',
      robots_txt: 'User-agent: *\nDisallow: /\n',
    });
    expect(obs.sources_checked).toEqual(['robots-txt']);
    expect(obs.signals.length).toBe(4);
    for (const signal of obs.signals) {
      expect(signal.decision).toBe('deny');
      expect(signal.source).toBe('robots-txt');
    }
  });

  it('creates observation from tdmrep.json only', () => {
    const obs = createObservation({
      target_uri: 'https://example.com',
      tdmrep_json: JSON.stringify({ 'tdm-reservation': 1 }),
    });
    expect(obs.sources_checked).toEqual(['tdmrep-json']);
    expect(obs.signals.length).toBe(2);
    expect(obs.signals[0].purpose).toBe('tdm');
    expect(obs.signals[0].decision).toBe('deny');
  });

  it('creates observation from Content-Usage only', () => {
    const obs = createObservation({
      target_uri: 'https://example.com',
      content_usage: 'train-ai=n',
    });
    expect(obs.sources_checked).toEqual(['content-usage-header']);
    // train-ai=n produces ai-training:deny + train-genai inherits -> ai-generative:deny
    expect(obs.signals.length).toBeGreaterThanOrEqual(1);
    const training = obs.signals.find((s) => s.purpose === 'ai-training');
    expect(training?.decision).toBe('deny');
  });

  it('resolves signals with correct precedence', () => {
    const obs = createObservation({
      target_uri: 'https://example.com',
      tdmrep_json: JSON.stringify({ 'tdm-reservation': 1 }),
      robots_txt: 'User-agent: *\nDisallow:\n',
    });
    // tdmrep denies ai-training, robots allows all
    // tdmrep should win for ai-training
    const training = obs.signals.find((s) => s.purpose === 'ai-training');
    expect(training?.decision).toBe('deny');
    expect(training?.source).toBe('tdmrep-json');

    // robots.txt should provide other purposes
    const inference = obs.signals.find((s) => s.purpose === 'ai-inference');
    expect(inference?.decision).toBe('allow');
    expect(inference?.source).toBe('robots-txt');
  });

  it('includes digest when provided', () => {
    const obs = createObservation({
      target_uri: 'https://example.com',
      digest: { alg: 'sha-256', val: 'abc123' },
    });
    expect(obs.digest).toEqual({ alg: 'sha-256', val: 'abc123' });
  });

  it('sets observed_at to ISO 8601 timestamp', () => {
    const obs = createObservation({
      target_uri: 'https://example.com',
    });
    // Should be a valid ISO 8601 date
    expect(new Date(obs.observed_at).toISOString()).toBe(obs.observed_at);
  });

  it('tracks all checked sources in order', () => {
    const obs = createObservation({
      target_uri: 'https://example.com',
      tdmrep_json: '{}',
      content_usage: '',
      robots_txt: '',
    });
    expect(obs.sources_checked).toEqual(['tdmrep-json', 'content-usage-header', 'robots-txt']);
  });
});
