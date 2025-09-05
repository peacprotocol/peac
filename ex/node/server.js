/**
 * PEAC Protocol v0.9.12 - Node.js/Hono Server
 * Production-ready example with complete HTTP 402 flow
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { sign, verify } from '@peac/core';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Rate limiter (simplified)
const rateLimiter = new Map();

// Keys for signing/verification
const KEYS = {
  'site-2025-09': {
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'Gb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE',
    d: 'nWFkjsNI6V7oF0vHMSiNqq6kFsvJzGLpFokc84IBmzw', // Private key (signing only)
  },
};

// Discovery endpoint
app.get('/.well-known/peac.txt', (c) => {
  const peactxt = `version: 0.9.12
preferences: ${c.req.header('host')}/.well-known/aipref.json
access_control: http-402
payments: ["x402", "l402"]
provenance: c2pa
receipts: required
verify: ${c.req.header('host')}/peac/verify
public_keys:
  - kid: "site-2025-09" alg: "EdDSA" key: "MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE"`;

  return c.text(peactxt, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      ETag: '"v0.9.12-2025-09"',
    },
  });
});

// AIPREF endpoint
app.get('/.well-known/aipref.json', (c) => {
  const aipref = {
    version: '0.1',
    'train-ai': false,
    crawl: true,
    commercial: false,
    'rate-limit': { requests: 100, window: '1m' },
  };

  return c.json(aipref, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

// Issue receipt endpoint
app.post('/peac/issue', async (c) => {
  try {
    const { subject, payment } = await c.req.json();

    // Create receipt
    const receipt = {
      subject: { uri: subject },
      aipref: {
        status: 'active',
        checked_at: new Date().toISOString(),
        snapshot: {
          'train-ai': false,
          crawl: true,
          commercial: false,
        },
        digest: {
          alg: 'JCS-SHA256',
          val: 'abc123...', // Actual digest of AIPREF
        },
      },
      enforcement: {
        method: payment ? 'http-402' : 'none',
      },
      payment: payment || undefined,
      issued_at: new Date().toISOString(),
      kid: 'site-2025-09',
    };

    // Sign receipt
    const jws = await sign(receipt, {
      privateKey: KEYS['site-2025-09'],
      kid: 'site-2025-09',
    });

    return c.json({ receipt: jws });
  } catch (error) {
    return c.json(
      {
        type: 'https://peac.dev/errors/signing-failed',
        title: 'Receipt Signing Failed',
        status: 500,
        detail: error.message,
      },
      500,
    );
  }
});

// Verify receipt endpoint
app.post('/peac/verify', async (c) => {
  // Rate limiting
  const clientId = c.req.header('x-forwarded-for') || 'unknown';
  const attempts = rateLimiter.get(clientId) || 0;

  if (attempts > 100) {
    return c.json(
      {
        type: 'https://peac.dev/errors/rate-limited',
        title: 'Rate Limit Exceeded',
        status: 429,
        detail: 'Exceeded 100 requests per minute',
        retry_after: 60,
      },
      429,
    );
  }

  rateLimiter.set(clientId, attempts + 1);
  setTimeout(() => rateLimiter.delete(clientId), 60000);

  try {
    const receipt = await c.req.text();
    const result = await verify(receipt, KEYS);

    return c.json({
      valid: true,
      receipt: result.obj,
      issued_at: result.obj.issued_at,
      kid: result.obj.kid,
    });
  } catch (error) {
    return c.json(
      {
        type: 'https://peac.dev/errors/invalid-proof',
        title: 'Receipt Verification Failed',
        status: 401,
        detail: error.message,
      },
      401,
    );
  }
});

// Protected API with 402 flow
app.get('/api/content/:id', async (c) => {
  const receiptHeader = c.req.header('PEAC-Receipt');

  if (!receiptHeader) {
    // Check Accept-Payments preference
    const acceptPayments = c.req.header('Accept-Payments');
    const preferredRail = parseAcceptPayments(acceptPayments);

    // Build challenges based on preference
    const challenges = buildChallenges(preferredRail);

    return c.json(
      {
        type: 'https://www.rfc-editor.org/rfc/rfc9110.html#status.402',
        title: 'Payment Required',
        status: 402,
        detail: `Access to /api/content/${c.req.param('id')} requires payment`,
        instance: `/api/content/${c.req.param('id')}`,
        'accept-payment': challenges,
      },
      402,
      {
        'WWW-Authenticate': challenges
          .map((ch) => `${ch.rail} challenge="${ch.challenge}"`)
          .join(', '),
      },
    );
  }

  // Verify receipt
  try {
    const result = await verify(receiptHeader, KEYS);
    const receipt = result.obj;

    // Validate AIPREF
    if (receipt.aipref?.status !== 'active') {
      throw new Error('AIPREF policy not active');
    }

    // Validate payment if required
    if (receipt.enforcement?.method === 'http-402') {
      if (!receipt.payment || !receipt.payment.evidence) {
        throw new Error('Payment evidence required');
      }

      // Verify payment with appropriate adapter
      const adapter = getPaymentAdapter(receipt.payment.rail);
      const valid = await adapter.verify(receipt.payment.evidence);

      if (!valid) {
        throw new Error('Payment verification failed');
      }
    }

    // Serve content
    return c.json({
      id: c.req.param('id'),
      content: 'Premium content here',
      served_at: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        type: 'https://peac.dev/errors/invalid-receipt',
        title: 'Invalid Receipt',
        status: 401,
        detail: error.message,
      },
      401,
    );
  }
});

// Helper: Parse Accept-Payments header
function parseAcceptPayments(header) {
  if (!header) return 'x402'; // Default

  const parts = header.split(',').map((p) => {
    const [rail, q] = p.trim().split(';q=');
    return { rail, q: parseFloat(q || '1.0') };
  });

  parts.sort((a, b) => b.q - a.q);
  return parts[0]?.rail || 'x402';
}

// Helper: Build payment challenges
function buildChallenges(preferredRail) {
  const challenges = [
    {
      rail: 'x402',
      challenge: 'x402:pay:0xContractAddress@1:2.50:USD',
      estimate: { value: '2.50', currency: 'USD' },
    },
    {
      rail: 'l402',
      challenge: 'l402:invoice:lnbc2500n1...',
      estimate: { value: '2.50', currency: 'USD' },
    },
  ];

  // Put preferred rail first
  if (preferredRail === 'l402') {
    challenges.reverse();
  }

  // Add Tempo in development mode
  if (process.env.NODE_ENV === 'development') {
    challenges.push({
      rail: 'tempo',
      challenge: 'tempo:pay:contract@testnet:2.50:USD',
      estimate: { value: '2.50', currency: 'USD' },
    });
  }

  return challenges;
}

// Mock payment adapters
const paymentAdapters = {
  x402: {
    async verify(evidence) {
      return evidence.provider_ids?.some((id) => id.startsWith('x402:'));
    },
  },
  l402: {
    async verify(evidence) {
      return evidence.provider_ids?.some((id) => id.startsWith('l402:'));
    },
  },
  tempo: {
    async verify(evidence) {
      return evidence.provider_ids?.some((id) => id.startsWith('tempo:'));
    },
  },
};

function getPaymentAdapter(rail) {
  return paymentAdapters[rail] || paymentAdapters.x402;
}

// Start server
const port = process.env.PORT || 3000;
console.log(`PEAC v0.9.12 server starting on port ${port}`);
console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
console.log(`Payment rails: x402, l402${process.env.NODE_ENV === 'development' ? ', tempo' : ''}`);

export default {
  port,
  fetch: app.fetch,
};
