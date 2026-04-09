/**
 * PEAC Express Middleware Demo
 *
 * Demo only, not production-hardened. Shows receipt issuance via middleware.
 * Run with: pnpm express-demo
 *
 * Then:
 *   curl -s http://localhost:3001/api/data -D- | grep PEAC-Receipt
 */

import express from 'express';
import { issue, generateKeypair } from '@peac/protocol';

async function main() {
  const app = express();
  const { privateKey } = await generateKeypair();
  const kid = 'quickstart-key-1';

  console.log('PEAC Express Middleware Demo\n');

  // Middleware: issue a receipt for every response
  app.use(async (_req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      // Issue a receipt for this response
      issue({
        iss: 'https://quickstart.example.com',
        kind: 'evidence',
        type: 'org.peacprotocol/api-response',
        privateKey,
        kid,
      })
        .then(({ jws }) => {
          res.setHeader('PEAC-Receipt', jws);
          return originalJson(body);
        })
        .catch(() => originalJson(body));
      return res;
    } as any;
    next();
  });

  app.get('/api/data', (_req, res) => {
    res.json({ message: 'Hello from PEAC-enabled API', timestamp: Date.now() });
  });

  const port = 3001;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`\nTry:`);
    console.log(`  curl -s http://localhost:${port}/api/data -D- | head -20`);
    console.log(`  # Look for the PEAC-Receipt header\n`);
  });
}

main().catch(console.error);
