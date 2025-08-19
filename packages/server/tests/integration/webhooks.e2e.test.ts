import request from 'supertest';
import { createServer } from '../../src/http/server';
import { Application } from 'express';
import { createWebhookSignature, WebhookVerifier } from '../../src/webhooks/verify';
import {
  WebhookSecretManager,
  MemorySecretStore,
  rotationConfigs,
} from '../../src/webhooks/secret-rotation';

describe('Webhooks E2E Tests', () => {
  let app: Application;

  beforeAll(async () => {
    process.env.PEAC_WEBHOOK_SECRET = 'test-webhook-secret-123';
    app = await createServer();
  });

  afterAll(() => {
    delete process.env.PEAC_WEBHOOK_SECRET;
  });

  describe('POST /webhooks/peac', () => {
    it('should accept valid webhook with correct signature', async () => {
      const payload = {
        type: 'payment.succeeded',
        id: 'pay_123',
        object: 'payment',
        data: { amount: 100 },
        created: Math.floor(Date.now() / 1000),
      };

      const rawBody = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createWebhookSignature('test-webhook-secret-123', timestamp, rawBody);
      const signatureHeader = `t=${timestamp},s=${signature}`;

      const response = await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signatureHeader)
        .set('Content-Type', 'application/json')
        .send(payload) // Send as JSON object, not raw string
        .expect(204);

      expect(response.body).toEqual({});
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = {
        type: 'payment.failed',
        id: 'pay_456',
        object: 'payment',
        data: { error: 'declined' },
        created: Math.floor(Date.now() / 1000),
      };

      const rawBody = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signatureHeader = `t=${timestamp},s=invalid_signature`;

      const response = await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signatureHeader)
        .set('Content-Type', 'application/json')
        .send(payload) // Send as JSON object
        .expect(401);

      expect(response.body.type).toBe(
        'https://peacprotocol.org/problems/webhook-signature-invalid',
      );
    });

    it('should reject webhook with missing signature', async () => {
      const payload = {
        type: 'negotiation.updated',
        id: 'neg_789',
        object: 'negotiation',
        data: { state: 'accepted' },
        created: Math.floor(Date.now() / 1000),
      };

      const response = await request(app)
        .post('/webhooks/peac')
        .set('Content-Type', 'application/json')
        .send(payload)
        .expect(401);

      expect(response.body.type).toBe(
        'https://peacprotocol.org/problems/webhook-signature-invalid',
      );
      expect(response.body.detail).toMatch(/Missing Peac-Signature header/);
    });

    it('should reject webhook with timestamp too old', async () => {
      const payload = {
        type: 'payment.succeeded',
        id: 'pay_old',
        object: 'payment',
        data: { amount: 50 },
        created: Math.floor(Date.now() / 1000),
      };

      const rawBody = JSON.stringify(payload);
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 300).toString(); // 5 minutes ago
      const signature = createWebhookSignature('test-webhook-secret-123', oldTimestamp, rawBody);
      const signatureHeader = `t=${oldTimestamp},s=${signature}`;

      const response = await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signatureHeader)
        .set('Content-Type', 'application/json')
        .send(payload) // Send as JSON object
        .expect(401);

      expect(response.body.type).toBe(
        'https://peacprotocol.org/problems/webhook-signature-invalid',
      );
      expect(response.body.detail).toMatch(/timestamp_too_old/);
    });

    it('should reject webhook with invalid payload', async () => {
      const payload = {
        invalid: 'payload',
      };

      const rawBody = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createWebhookSignature('test-webhook-secret-123', timestamp, rawBody);
      const signatureHeader = `t=${timestamp},s=${signature}`;

      const response = await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signatureHeader)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(400);

      expect(response.body.type).toBe('https://peacprotocol.org/problems/validation-error');
    });

    it('should prevent replay attacks', async () => {
      const payload = {
        type: 'payment.succeeded',
        id: 'pay_replay',
        object: 'payment',
        data: { amount: 25 },
        created: Math.floor(Date.now() / 1000),
      };

      const rawBody = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createWebhookSignature('test-webhook-secret-123', timestamp, rawBody);
      const signatureHeader = `t=${timestamp},s=${signature}`;

      // First request should succeed
      await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signatureHeader)
        .set('Content-Type', 'application/json')
        .send(payload) // Send as JSON object
        .expect(204);

      // Second identical request should be rejected as replay
      const response = await request(app)
        .post('/webhooks/peac')
        .set('Peac-Signature', signatureHeader)
        .set('Content-Type', 'application/json')
        .send(payload) // Send as JSON object
        .expect(401);

      expect(response.body.detail).toMatch(/replay_attack/);
    });
  });

  describe('Webhook Secret Rotation', () => {
    it('should verify webhooks with rotated secrets', async () => {
      // Create a webhook verifier with rotation enabled
      const rotationConfig = {
        ...rotationConfigs.development,
        rotationIntervalMs: 60000, // 1 minute for testing
        gracePeriodMs: 30000, // 30 seconds
        preActivationMs: 1000, // 1 second
      };

      const store = new MemorySecretStore();
      const secretManager = new WebhookSecretManager({
        ...rotationConfig,
        externalStore: store,
      });

      // Generate and activate a secret
      const secret = await secretManager.rotateSecret();
      await new Promise((resolve) => setTimeout(resolve, 1100)); // Wait for activation

      const payload = {
        type: 'payment.succeeded',
        id: 'pay_rotated',
        object: 'payment',
        data: { amount: 100 },
        created: Math.floor(Date.now() / 1000),
      };

      const rawBody = JSON.stringify(payload);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = secretManager.createSignature(secret.value, timestamp, rawBody);
      const signatureHeader = `t=${timestamp},s=${signature}`;

      // Verify with secret manager
      const verification = secretManager.verifySignature(signature, timestamp, rawBody);
      expect(verification.valid).toBe(true);
      expect(verification.secretId).toBe(secret.id);

      await secretManager.shutdown();
    });

    it('should handle secret rotation gracefully', async () => {
      const store = new MemorySecretStore();
      const secretManager = new WebhookSecretManager({
        ...rotationConfigs.development,
        rotationIntervalMs: 2000, // 2 seconds
        gracePeriodMs: 1000, // 1 second grace
        preActivationMs: 500, // 0.5 second pre-activation
        maxActiveSecrets: 2,
      });

      // Create first secret
      const secret1 = await secretManager.rotateSecret();
      await new Promise((resolve) => setTimeout(resolve, 600)); // Wait for activation

      // Create second secret
      const secret2 = await secretManager.rotateSecret();
      await new Promise((resolve) => setTimeout(resolve, 600)); // Wait for activation

      // Both secrets should be valid during grace period
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const rawBody = '{"test": "data"}';

      const sig1 = secretManager.createSignature(secret1.value, timestamp, rawBody);
      const sig2 = secretManager.createSignature(secret2.value, timestamp, rawBody);

      const result1 = secretManager.verifySignature(sig1, timestamp, rawBody);
      const result2 = secretManager.verifySignature(sig2, timestamp, rawBody);

      expect(result1.valid).toBe(true);
      expect(result2.valid).toBe(true);

      const stats = secretManager.getStats();
      expect(stats.totalRotations).toBe(2);
      expect(stats.activeSecrets).toBeGreaterThan(0);

      await secretManager.shutdown();
    });

    it('should provide rotation statistics', async () => {
      const secretManager = new WebhookSecretManager(rotationConfigs.development);

      const initialStats = secretManager.getStats();
      expect(initialStats.totalRotations).toBe(0);
      expect(initialStats.successfulRotations).toBe(0);

      await secretManager.rotateSecret();

      const updatedStats = secretManager.getStats();
      expect(updatedStats.totalRotations).toBe(1);
      expect(updatedStats.successfulRotations).toBe(1);
      expect(updatedStats.lastRotation).toBeTruthy();

      await secretManager.shutdown();
    });

    it('should handle external store operations', async () => {
      const store = new MemorySecretStore();
      const secretManager = new WebhookSecretManager({
        ...rotationConfigs.development,
        externalStore: store,
      });

      const secret = await secretManager.rotateSecret();

      // Verify secret was stored externally
      const storedSecret = await store.get(secret.id);
      expect(storedSecret).toBeTruthy();
      expect(storedSecret!.value).toBe(secret.value);

      // Verify listing functionality
      const allSecrets = await store.list(false);
      expect(allSecrets).toHaveLength(1);

      await secretManager.shutdown();
    });
  });
});
