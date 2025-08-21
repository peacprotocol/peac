/**
 * Agreement Creation Tests - POST /peac/agreements
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';

describe('Agreement Creation - POST /peac/agreements', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createServer();
  });

  const validProposal = {
    purpose: 'AI training on web content',
    consent: {
      required: true,
      mechanism: 'api-acknowledgment',
    },
    attribution: {
      required: true,
      text: 'Content provided by Example Corp',
    },
    pricing_policy: {
      price: '2500',
      currency: 'USD',
      duration: 86400,
      usage: 'training' as const,
    },
    terms: {
      text: 'Standard AI training license',
      version: '1.0',
    },
  };

  describe('Happy Path', () => {
    it('should create agreement with 201 and proper headers', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'application/json')
        .send(validProposal)
        .expect(201);

      expect(response.headers).toHaveProperty('location');
      expect(response.headers.location).toMatch(/^\/peac\/agreements\/agr_/);

      expect(response.headers).toHaveProperty('etag');
      expect(response.headers.etag).toMatch(/^W\/"[a-f0-9]{64}"$/);

      expect(response.headers['cache-control']).toBe('no-store');

      expect(response.body).toMatchObject({
        id: expect.stringMatching(/^agr_/),
        fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        protocol_version: '0.9.6',
        status: 'valid',
        created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        proposal: validProposal,
      });
    });
  });

  describe('Protocol Version Validation', () => {
    it('should return 426 when X-PEAC-Protocol is missing', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('Content-Type', 'application/json')
        .send(validProposal)
        .expect(426);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/protocol-version-required',
        title: 'Upgrade Required',
        status: 426,
        supported: ['0.9.6'],
      });
    });

    it('should return 426 when protocol version is wrong', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.8.0')
        .set('Content-Type', 'application/json')
        .send(validProposal)
        .expect(426);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/protocol-version-unsupported',
        title: 'Upgrade Required',
        status: 426,
        provided_version: '0.8.0',
        supported: ['0.9.6'],
      });
    });
  });

  describe('Content Type Validation', () => {
    it('should return 415 when Content-Type is wrong', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(validProposal))
        .expect(415);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/unsupported-media-type',
        title: 'Unsupported Media Type',
        status: 415,
      });
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 for invalid proposal structure', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'application/json')
        .send({ invalid: 'proposal' })
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/validation-error',
        status: 400,
      });
    });

    it('should return 400 for malformed JSON', async () => {
      const response = await request(app)
        .post('/peac/agreements')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/validation-error',
        status: 400,
        detail: 'Invalid JSON in request body',
      });
    });
  });
});
