/**
 * PEAC Protocol v0.9.12 - Minimal Cloudflare Worker
 * Copy-paste ready implementation with HTTP 402 and AIPREF
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Discovery endpoint
    if (url.pathname === '/.well-known/peac.txt') {
      return new Response(PEAC_TXT, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Verify endpoint
    if (url.pathname === '/peac/verify' && request.method === 'POST') {
      try {
        const receipt = await request.text();
        const result = await verifyReceipt(receipt, KEYS);

        return new Response(JSON.stringify({ valid: true, receipt: result }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            type: 'https://peac.dev/errors/invalid-proof',
            title: 'Receipt Verification Failed',
            status: 401,
            detail: error.message,
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/problem+json' },
          }
        );
      }
    }

    // Protected resource requiring payment
    if (url.pathname.startsWith('/api/')) {
      // Check for receipt header
      const receiptHeader = request.headers.get('PEAC-Receipt');

      if (!receiptHeader) {
        // Return 402 Payment Required with challenges
        return new Response(
          JSON.stringify({
            type: 'https://www.rfc-editor.org/rfc/rfc9110.html#status.402',
            title: 'Payment Required',
            status: 402,
            detail: 'Access requires payment receipt',
            'accept-payment': [
              {
                rail: 'x402',
                challenge: 'x402:pay:0xABC...@1:1.00:USD',
                estimate: { value: '1.00', currency: 'USD' },
              },
              {
                rail: 'l402',
                challenge: 'l402:invoice:lnbc1000...',
                estimate: { value: '1.00', currency: 'USD' },
              },
            ],
          }),
          {
            status: 402,
            headers: {
              'Content-Type': 'application/problem+json',
              'WWW-Authenticate': 'PEAC realm="api", rails="x402,l402"',
            },
          }
        );
      }

      // Verify the receipt
      try {
        const receipt = await verifyReceipt(receiptHeader, KEYS);

        // Check AIPREF compliance
        if (receipt.aipref?.status !== 'active') {
          throw new Error('AIPREF policy not active');
        }

        // Check payment if required
        if (receipt.enforcement?.method === 'http-402' && !receipt.payment) {
          throw new Error('Payment evidence required');
        }

        // Serve protected content
        return new Response(JSON.stringify({ data: 'Protected content' }), {
          headers: {
            'Content-Type': 'application/json',
            'PEAC-Receipt': receiptHeader, // Echo back
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            type: 'https://peac.dev/errors/invalid-proof',
            title: 'Invalid Receipt',
            status: 401,
            detail: error.message,
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/problem+json' },
          }
        );
      }
    }

    // Default 404
    return new Response('Not Found', { status: 404 });
  },
};

// Minimal receipt verification (replace with @peac/core in production)
async function verifyReceipt(jws, keys) {
  // Parse JWS header
  const [headerB64, payloadB64, signature] = jws.split('.');
  const header = JSON.parse(atob(headerB64));

  // Validate algorithm
  if (header.alg !== 'EdDSA') {
    throw new Error(`Invalid algorithm: ${header.alg}`);
  }

  // Check kid
  if (!header.kid || !keys[header.kid]) {
    throw new Error(`Unknown kid: ${header.kid}`);
  }

  // In production, use proper crypto verification
  // For demo, just parse and return payload
  const payload = JSON.parse(atob(payloadB64));

  // Basic schema validation
  if (!payload.subject?.uri || !payload.aipref || !payload.issued_at || !payload.kid) {
    throw new Error('Invalid receipt schema');
  }

  return payload;
}

// Discovery configuration
const PEAC_TXT = `version: 0.9.12
preferences: https://example.com/.well-known/aipref.json
access_control: http-402
payments: ["x402", "l402"]
provenance: c2pa
receipts: required
verify: https://example.com/peac/verify
public_keys:
  - kid: "worker-2025-09" alg: "EdDSA" key: "MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE"`;

// Public keys for verification
const KEYS = {
  'worker-2025-09': {
    kty: 'OKP',
    crv: 'Ed25519',
    x: 'Gb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE',
  },
};
