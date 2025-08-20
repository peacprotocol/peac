/**
 * Payment Charge Tests - POST /peac/payments/charges
 * 
 * Tests agreement-bound payment processing with comprehensive validation.
 */

import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { agreementStore } from '../../src/agreements/store';
import { Agreement } from '@peacprotocol/schema';

describe('Payment Charges - POST /peac/payments/charges', () => {
  let app: Application;
  let validAgreement: Agreement;
  let originalPaymentProvider: string | undefined;

  beforeAll(async () => {
    // Use mock provider for testing (deterministic responses)
    originalPaymentProvider = process.env.PAYMENT_PROVIDER;
    process.env.PAYMENT_PROVIDER = 'mock';
    
    app = await createServer();
  });

  afterAll(() => {
    // Restore original environment
    if (originalPaymentProvider) {
      process.env.PAYMENT_PROVIDER = originalPaymentProvider;
    } else {
      delete process.env.PAYMENT_PROVIDER;
    }
  });

  beforeEach(() => {
    agreementStore.clear();
    
    // Create a valid agreement for testing
    validAgreement = {
      id: 'agr_test_payment_123',
      fingerprint: 'a'.repeat(64),
      protocol_version: '0.9.6',
      status: 'valid',
      created_at: new Date().toISOString(),
      proposal: {
        purpose: 'Test payment',
        consent: { required: true, mechanism: 'api' },
        attribution: { required: false },
        pricing_policy: { price: '1000', duration: 3600, usage: 'inference' },
        terms: { text: 'Test terms' }
      }
    };
    
    agreementStore.set(validAgreement.id, validAgreement);
  });

  describe('Happy Path', () => {
    it('should successfully process payment with mock provider', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD'
        })
        .expect(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.headers['authorization']).toMatch(/^Bearer mock_session_/);
      
      // Validate payment receipt structure
      expect(response.body).toMatchObject({
        id: expect.stringMatching(/^pay_/),
        amount: '2500',
        currency: 'USD',
        agreement_id: validAgreement.id,
        agreement_fingerprint: validAgreement.fingerprint,
        status: 'completed',
        created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        metadata: {
          provider: 'mock',
          session: expect.stringMatching(/^mock_session_/)
        }
      });
    });

    it('should process payment with metadata passthrough', async () => {
      const customMetadata = { 
        user_id: 'user123',
        order_id: 'order456'
      };
      
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Content-Type', 'application/json')
        .send({
          amount: '1000',
          currency: 'EUR',
          metadata: customMetadata
        })
        .expect(200);

      expect(response.body.metadata).toMatchObject({
        provider: 'mock',
        session: expect.stringMatching(/^mock_session_/),
        ...customMetadata
      });
    });
  });

  describe('Agreement Validation', () => {
    it('should return 422 when X-PEAC-Agreement is missing', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD'
        })
        .expect(422);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/invalid-reference',
        status: 422,
        detail: expect.stringContaining('X-PEAC-Agreement header is required')
      });
    });

    it('should return 422 for unknown agreement ID', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', 'agr_nonexistent')
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD'
        })
        .expect(422);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/invalid-reference',
        status: 422,
        detail: expect.stringContaining('Agreement agr_nonexistent not found')
      });
    });

    it('should return 422 when agreement status is not valid', async () => {
      const invalidAgreement: Agreement = {
        ...validAgreement,
        id: 'agr_invalid_status',
        status: 'invalid',
        reason: 'revoked'
      };
      agreementStore.set(invalidAgreement.id, invalidAgreement);

      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', invalidAgreement.id)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD'
        })
        .expect(422);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/invalid-reference',
        status: 422,
        detail: expect.stringContaining('Agreement agr_invalid_status is not valid')
      });
    });

    it('should return 409 on fingerprint mismatch when X-PEAC-Fingerprint present', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('X-PEAC-Fingerprint', 'b'.repeat(64)) // Wrong fingerprint
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD'
        })
        .expect(409);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/agreement-mismatch',
        status: 409,
        detail: 'Agreement fingerprint mismatch'
      });
    });
  });

  describe('Protocol Version Validation', () => {
    it('should return 426 when X-PEAC-Protocol is missing', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD'
        })
        .expect(426);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/protocol-version-required',
        status: 426,
        supported: ['0.9.6']
      });
    });

    it('should return 426 when protocol version is wrong', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.8.0')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Content-Type', 'application/json')
        .send({
          amount: '2500',
          currency: 'USD'
        })
        .expect(426);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/protocol-version-unsupported',
        status: 426,
        provided_version: '0.8.0',
        supported: ['0.9.6']
      });
    });
  });

  describe('Content Type Validation', () => {
    it('should return 415 when Content-Type is wrong', async () => {
      const response = await request(app)
        .post('/peac/payments/charges')
        .set('X-PEAC-Protocol', '0.9.6')
        .set('X-PEAC-Agreement', validAgreement.id)
        .set('Content-Type', 'text/plain')
        .send('{"amount": "2500"}')
        .expect(415);

      expect(response.headers['content-type']).toMatch(/application\/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://peacprotocol.org/problems/unsupported-media-type',
        status: 415
      });
    });
  });
});